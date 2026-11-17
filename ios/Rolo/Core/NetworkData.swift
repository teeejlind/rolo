import CoreLocation
import Foundation

/// The trunk network bundled with the app (tools/build_app_data.py): stations and corridor lines,
/// so the BRT map draws instantly and offline.
nonisolated struct NetworkData: Codable, Sendable {
    nonisolated struct Station: Codable, Hashable, Sendable, Identifiable {
        var id: String
        var name: String
        var lat: Double
        var lon: Double
        var letter: String
        var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) }
    }

    nonisolated struct Corridor: Codable, Hashable, Sendable, Identifiable {
        var id: String
        var letter: String
        var name: String
        var coords: [[Double]]
        var coordinates: [CLLocationCoordinate2D] { coords.map { .init(latitude: $0[0], longitude: $0[1]) } }
    }

    var stations: [Station]
    var corridors: [Corridor]
    var zoneColors: [String: String]

    static let empty = NetworkData(stations: [], corridors: [], zoneColors: [:])

    static func load() -> NetworkData {
        guard let url = Bundle.main.url(forResource: "network", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let network = try? JSONDecoder().decode(NetworkData.self, from: data) else { return .empty }
        return network
    }

    /// Loose station search: "portal del norte" finds "Portal Norte - Unicervantes".
    /// The feed's names carry sponsors, so the router's geocoder misses how people actually say them.
    func search(_ query: String, limit: Int = 3) -> [Station] {
        let filler: Set<String> = ["de", "del", "la", "el", "las", "los", "estacion", "station", "tm", "transmilenio"]
        let terms = Self.words(query).filter { !filler.contains($0) }
        guard !terms.isEmpty else { return [] }
        let hits = stations.filter { station in
            let words = Self.words(station.name)
            return terms.allSatisfy { term in words.contains { $0.hasPrefix(term) } }
        }
        return Array(hits.sorted { Self.words($0.name).first == terms.first && Self.words($1.name).first != terms.first }.prefix(limit))
    }

    static func words(_ s: String) -> [String] {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
            .lowercased()
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .map(String.init)
    }

    func station(id: String?) -> Station? {
        guard let id else { return nil }
        let bare = id.split(separator: "_").last.map(String.init) ?? id
        return stations.first { $0.id == bare }
    }
}
