import CoreLocation
import Foundation

// Response shapes from the MOTIS 2 API (/api/v5 plan, stoptimes, trip; /api/v1 geocode).
// Only the fields Rolo uses are declared; everything else in the payload is ignored.

nonisolated struct EncodedPolyline: Codable, Hashable, Sendable {
    var points: String
    var precision: Int?
}

nonisolated struct Place: Codable, Hashable, Sendable {
    var name: String
    var stopId: String?
    var parentId: String?
    var stopCode: String?
    var lat: Double
    var lon: Double
    var arrival: Date?
    var departure: Date?
    var scheduledArrival: Date?
    var scheduledDeparture: Date?
    var cancelled: Bool?

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) }
}

nonisolated struct StepInstruction: Codable, Hashable, Sendable {
    var relativeDirection: String?
    var distance: Double?
    var streetName: String?
}

nonisolated struct Leg: Codable, Hashable, Sendable, Identifiable {
    var mode: String
    var from: Place
    var to: Place
    var duration: Int
    var startTime: Date
    var endTime: Date
    var scheduledStartTime: Date?
    var scheduledEndTime: Date?
    var realTime: Bool?
    var distance: Double?
    var headsign: String?
    var routeShortName: String?
    var routeLongName: String?
    var routeColor: String?
    var routeTextColor: String?
    var agencyId: String?
    var agencyName: String?
    var routeId: String?
    var tripId: String?
    var tripFrom: Place?
    var tripTo: Place?
    var intermediateStops: [Place]?
    var legGeometry: EncodedPolyline?
    var steps: [StepInstruction]?

    var id: String { "\(mode)|\(tripId ?? "")|\(startTime.timeIntervalSince1970)|\(from.name)" }
    var isWalk: Bool { mode == "WALK" }
    var isTransit: Bool { !["WALK", "BIKE", "CAR", "RENTAL", "FLEX", "ODM"].contains(mode) }

    var coordinates: [CLLocationCoordinate2D] {
        guard let g = legGeometry else { return [from.coordinate, to.coordinate] }
        let decoded = Polyline.decode(g.points, precision: g.precision ?? 6)
        return decoded.isEmpty ? [from.coordinate, to.coordinate] : decoded
    }

    /// Stops the vehicle serves on this leg, boarding stop through alighting stop.
    var allStops: [Place] { [from] + (intermediateStops ?? []) + [to] }
}

nonisolated struct Itinerary: Codable, Hashable, Sendable, Identifiable {
    var duration: Int
    var startTime: Date
    var endTime: Date
    var transfers: Int
    var legs: [Leg]

    var id: String { legs.map(\.id).joined(separator: "/") }
    var transitLegs: [Leg] { legs.filter(\.isTransit) }
    var walkSeconds: Int { legs.filter(\.isWalk).reduce(0) { $0 + $1.duration } }
}

nonisolated struct PlanResponse: Codable, Sendable {
    var itineraries: [Itinerary]
    var direct: [Itinerary]?
    var previousPageCursor: String?
    var nextPageCursor: String?
}

nonisolated struct StopTime: Codable, Hashable, Sendable, Identifiable {
    var place: Place
    var mode: String
    var realTime: Bool?
    var headsign: String?
    var routeShortName: String?
    var routeLongName: String?
    var routeColor: String?
    var routeTextColor: String?
    var agencyId: String?
    var agencyName: String?
    var routeId: String?
    var tripId: String
    var tripFrom: Place?
    var tripTo: Place?
    var cancelled: Bool?
    var tripCancelled: Bool?

    var id: String { "\(tripId)|\(place.stopId ?? place.name)" }
}

nonisolated struct StopTimesResponse: Codable, Sendable {
    var stopTimes: [StopTime]
    var place: Place?
    var nextPageCursor: String?
}

nonisolated struct GeoArea: Codable, Hashable, Sendable {
    var name: String
    var adminLevel: Double?
    var matched: Bool?
    var isDefault: Bool?

    enum CodingKeys: String, CodingKey {
        case name, adminLevel, matched
        case isDefault = "default"
    }
}

nonisolated struct GeoMatch: Codable, Hashable, Sendable, Identifiable {
    var type: String
    var name: String
    var matchId: String?
    var lat: Double
    var lon: Double
    var street: String?
    var houseNumber: String?
    var areas: [GeoArea]?

    enum CodingKeys: String, CodingKey {
        case type, name, lat, lon, street, houseNumber, areas
        case matchId = "id"
    }

    var id: String { matchId ?? "\(type)|\(name)|\(lat),\(lon)" }
    var isStop: Bool { type == "STOP" }

    /// Neighborhood / locality line, e.g. "Chapinero" or "Suba".
    var areaLine: String? {
        guard let areas, !areas.isEmpty else { return nil }
        let picked = areas.first { $0.isDefault == true }
            ?? areas.filter { ($0.adminLevel ?? 0) >= 8 }.max { ($0.adminLevel ?? 0) < ($1.adminLevel ?? 0) }
        return picked.map { $0.name.replacingOccurrences(of: "Localidad ", with: "") }
    }
}
