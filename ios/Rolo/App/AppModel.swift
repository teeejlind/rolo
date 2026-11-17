import CoreLocation
import Observation
import SwiftUI

enum Route: Hashable {
    case search(SearchPurpose)
    case plan
    case itinerary(Itinerary)
    case trip(TripRef)
    case settings
}

enum SearchPurpose: Hashable {
    case destination
    case origin
    case favorite(String)
}

struct TripRef: Hashable {
    var tripId: String
    var boardingStopId: String?
    var route: RouteInfo
    var destination: String
}

enum TripTime: Hashable {
    case now
    case departAt(Date)
    case arriveBy(Date)
}

struct TripRequest: Hashable {
    /// nil means "my location".
    var from: SavedPlace?
    var to: SavedPlace
    var when: TripTime = .now
}

enum MapFocus: Equatable {
    case nearby
    case itinerary(Itinerary)
    case trip(Leg, boardingStopId: String?)
}

enum SheetDetent {
    static let peek = PresentationDetent.height(170)
    static let mid = PresentationDetent.fraction(0.52)
    static let full = PresentationDetent.large
}

nonisolated struct ServerConfig: Codable, Hashable, Sendable {
    var name: String
    var urlString: String

    var url: URL { URL(string: urlString) ?? URL(string: "http://localhost:8080")! }

    static let local = ServerConfig(name: "Rolo router", urlString: "http://localhost:8080")
    static let transitous = ServerConfig(name: "Transitous (public, missing trunk routes)", urlString: "https://api.transitous.org")

    private static let key = "rolo.server.v1"

    static func load() -> ServerConfig {
        guard let data = UserDefaults.standard.data(forKey: key),
              let s = try? JSONDecoder().decode(ServerConfig.self, from: data) else { return .local }
        return s
    }

    func save() { UserDefaults.standard.set(try? JSONEncoder().encode(self), forKey: Self.key) }
}

/// Where Rolo pretends you are when the phone isn't in Bogotá (or location is off).
enum DemoSpot: String, CaseIterable, Identifiable, Codable {
    case chapinero, parque93, usaquen, centro, salitre, suba

    var id: String { rawValue }

    var name: String {
        switch self {
        case .chapinero: "Chapinero · Calle 72"
        case .parque93: "Parque de la 93"
        case .usaquen: "Usaquén"
        case .centro: "Centro · Las Aguas"
        case .salitre: "Salitre · Av. El Dorado"
        case .suba: "Suba · Av. Boyacá"
        }
    }

    var coordinate: CLLocationCoordinate2D {
        switch self {
        case .chapinero: .init(latitude: 4.6583, longitude: -74.0600)
        case .parque93: .init(latitude: 4.6767, longitude: -74.0485)
        case .usaquen: .init(latitude: 4.6950, longitude: -74.0310)
        case .centro: .init(latitude: 4.6021, longitude: -74.0667)
        case .salitre: .init(latitude: 4.6538, longitude: -74.1065)
        case .suba: .init(latitude: 4.7247, longitude: -74.0775)
        }
    }

    static func load() -> DemoSpot {
        DemoSpot(rawValue: UserDefaults.standard.string(forKey: "rolo.demoSpot") ?? "") ?? .chapinero
    }
}

@Observable
final class AppModel {
    var path: [Route] = []
    var detent: PresentationDetent = SheetDetent.mid
    var mapFocus: MapFocus = .nearby
    var tripRequest: TripRequest?
    var nearbyStations: [NearbyStation] = []
    var server: ServerConfig = .load()
    var demoSpot: DemoSpot = .load()

    let location = LocationManager()
    let store = PlaceStore()
    let network = NetworkData.load()

    var client: MotisClient { MotisClient(baseURL: server.url) }

    var inBogota: Bool { location.coordinate.map(Bogota.contains) ?? false }

    /// Real location in Bogotá, otherwise the chosen demo spot.
    var here: CLLocationCoordinate2D {
        if let c = location.coordinate, Bogota.contains(c) { return c }
        return demoSpot.coordinate
    }

    var hereLabel: String { inBogota ? "My location" : demoSpot.name }

    func setServer(_ s: ServerConfig) {
        server = s
        s.save()
    }

    func setDemoSpot(_ spot: DemoSpot) {
        demoSpot = spot
        UserDefaults.standard.set(spot.rawValue, forKey: "rolo.demoSpot")
    }

    func plan(to: SavedPlace, from: SavedPlace? = nil) {
        store.addRecent(to)
        tripRequest = TripRequest(from: from, to: to)
        path = [.plan]
        detent = SheetDetent.mid
    }

    func open(_ route: Route) {
        path.append(route)
    }
}
