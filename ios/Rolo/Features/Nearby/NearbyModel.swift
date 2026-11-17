import CoreLocation
import Observation
import SwiftUI

struct NearbyDeparture: Identifiable, Hashable {
    let stopTime: StopTime
    let time: Date
    var id: String { stopTime.id }
    var isRealtime: Bool { stopTime.realTime ?? false }
}

struct NearbyRoute: Identifiable, Hashable {
    let id: String
    let route: RouteInfo
    let destination: String
    let boarding: Boarding?
    let departures: [NearbyDeparture]
    var system: TransitSystem { route.system }
}

struct NearbyStation: Identifiable, Hashable {
    let id: String
    let name: String
    let coordinate: CLLocationCoordinate2D
    let distance: Double
    let routes: [NearbyRoute]

    var isTrunk: Bool { routes.contains { $0.system == .troncal || $0.system == .dual } }

    static func == (a: Self, b: Self) -> Bool { a.id == b.id && a.routes == b.routes }
    func hash(into h: inout Hasher) { h.combine(id) }
}

enum NearbyFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case transmilenio = "TransMilenio"
    case sitp = "SITP"
    var id: String { rawValue }

    func allows(_ s: TransitSystem) -> Bool {
        switch self {
        case .all: true
        case .transmilenio: s.isTransMilenio
        case .sitp: !s.isTransMilenio
        }
    }
}

@Observable
final class NearbyModel {
    private(set) var stations: [NearbyStation] = []
    private(set) var loading = false
    private(set) var errorText: String?
    private(set) var updated: Date?
    var filter: NearbyFilter = .all

    /// Refresh every 30 s for as long as the calling task lives.
    func run(app: AppModel) async {
        while !Task.isCancelled {
            await load(app: app)
            try? await Task.sleep(for: .seconds(30))
        }
    }

    func load(app: AppModel) async {
        let here = app.here
        loading = stations.isEmpty
        defer { loading = false }
        do {
            let response = try await fetch(app: app, here: here)
            stations = Self.group(response.stopTimes, here: here, network: app.network, now: AppClock.now)
            app.nearbyStations = stations
            errorText = nil
            updated = AppClock.now
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
            errorText = error.localizedDescription
        }
    }

    /// MOTIS caps a response at 1,024 departures, which a trunk station at rush hour blows through
    /// in under an hour. Start with a 40-minute window and narrow it until the server accepts.
    private func fetch(app: AppModel, here: CLLocationCoordinate2D) async throws -> StopTimesResponse {
        var lastError: Error?
        for minutes in [40, 20, 10] {
            do {
                return try await app.client.departures(near: here, radius: 600, window: minutes * 60, n: 60)
            } catch MotisClient.APIError.http(let code, let body) where code == 422 && body.contains("1024") {
                lastError = MotisClient.APIError.http(code, body)
            }
        }
        throw lastError ?? MotisClient.APIError.badURL
    }

    func visibleStations() -> [NearbyStation] {
        stations.compactMap { s in
            let routes = s.routes.filter { filter.allows($0.system) }
            return routes.isEmpty ? nil : NearbyStation(id: s.id, name: s.name, coordinate: s.coordinate, distance: s.distance, routes: routes)
        }
    }

    /// Departures -> stations -> one row per (route, destination), each shown only at its nearest station.
    static func group(_ times: [StopTime], here: CLLocationCoordinate2D, network: NetworkData, now: Date) -> [NearbyStation] {
        struct Item {
            let st: StopTime
            let station: String
            let distance: Double
            let destination: String
            let time: Date
            var routeKey: String { "\(st.routeShortName ?? "")|\(destination)" }
        }
        let origin = CLLocation(latitude: here.latitude, longitude: here.longitude)
        var items: [Item] = []
        for st in times {
            if st.cancelled == true || st.tripCancelled == true { continue }
            guard let t = st.place.departure ?? st.place.scheduledDeparture, t > now.addingTimeInterval(-30) else { continue }
            if let end = st.tripTo?.stopId, end == st.place.stopId { continue }  // arrivals, not departures
            let station = st.place.parentId ?? Bogota.stationName(st.place.name)
            let distance = origin.distance(from: CLLocation(latitude: st.place.lat, longitude: st.place.lon))
            let destination = Bogota.destination(routeLongName: st.routeLongName, tripTo: st.tripTo?.name, tripFrom: st.tripFrom?.name)
            items.append(Item(st: st, station: station, distance: distance, destination: destination, time: t))
        }

        var nearest: [String: (station: String, distance: Double)] = [:]
        for item in items where (nearest[item.routeKey]?.distance ?? .infinity) > item.distance {
            nearest[item.routeKey] = (item.station, item.distance)
        }

        var byStation: [String: [String: [Item]]] = [:]
        for item in items where nearest[item.routeKey]?.station == item.station {
            byStation[item.station, default: [:]][item.routeKey, default: []].append(item)
        }

        var stations: [NearbyStation] = []
        for (key, routes) in byStation {
            var rows: [NearbyRoute] = []
            var closest: Item?
            for (routeKey, list) in routes {
                let sorted = list.sorted { $0.time < $1.time }
                let first = sorted[0]
                if closest == nil || first.distance < closest!.distance { closest = first }
                rows.append(NearbyRoute(
                    id: "\(key)|\(routeKey)",
                    route: RouteInfo(first.st),
                    destination: first.destination,
                    boarding: Bogota.boarding(name: first.st.place.name, code: first.st.place.stopCode),
                    departures: sorted.prefix(3).map { NearbyDeparture(stopTime: $0.st, time: $0.time) }))
            }
            guard let closest else { continue }
            // Stable order (system, then route code) so rows don't reshuffle on every refresh.
            // Tiebreak on destination: each direction of a route is its own row with the same code.
            rows.sort {
                if $0.system != $1.system { return $0.system < $1.system }
                let byName = $0.route.badgeName.localizedStandardCompare($1.route.badgeName)
                return byName != .orderedSame ? byName == .orderedAscending : $0.destination < $1.destination
            }
            let trunk = network.station(id: closest.st.place.parentId)
            stations.append(NearbyStation(
                id: key,
                name: trunk?.name ?? Bogota.stationName(closest.st.place.name),
                coordinate: trunk?.coordinate ?? closest.st.place.coordinate,
                distance: closest.distance,
                routes: rows))
        }
        return Array(stations.sorted { $0.distance < $1.distance }.prefix(12))
    }
}
