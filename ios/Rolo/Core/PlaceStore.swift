import CoreLocation
import Foundation
import Observation

nonisolated struct SavedPlace: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var subtitle: String?
    var lat: Double
    var lon: Double
    var stopId: String?
    var isStop: Bool = false
    /// "Home", "Work", or a custom favorite label.
    var label: String?

    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lon) }
    var placeParam: String { stopId ?? MotisClient.placeParam(coordinate) }
    var title: String { label ?? name }

    var symbol: String {
        switch label {
        case "Home": "house.fill"
        case "Work": "briefcase.fill"
        case .some: "star.fill"
        case nil: isStop ? "bus.fill" : "mappin"
        }
    }

    init(match m: GeoMatch) {
        id = m.id
        name = m.isStop ? Bogota.stationName(m.name) : m.name
        subtitle = m.areaLine
        lat = m.lat
        lon = m.lon
        stopId = m.isStop ? m.matchId : nil
        isStop = m.isStop
    }

    init(id: String, name: String, subtitle: String? = nil, coordinate: CLLocationCoordinate2D, isStop: Bool = false, label: String? = nil) {
        self.id = id
        self.name = name
        self.subtitle = subtitle
        lat = coordinate.latitude
        lon = coordinate.longitude
        self.isStop = isStop
        self.label = label
    }

    /// Trunk stations route by coordinate, so they work against any server's stop ids.
    init(station s: NetworkData.Station) {
        self.init(id: "station:\(s.id)", name: s.name, subtitle: "Estación TransMilenio", coordinate: s.coordinate, isStop: true)
    }
}

/// Favorites (Home, Work, starred) and recent destinations, persisted in UserDefaults.
@Observable
final class PlaceStore {
    private(set) var favorites: [SavedPlace] = []
    private(set) var recents: [SavedPlace] = []

    private let favoritesKey = "rolo.favorites.v1"
    private let recentsKey = "rolo.recents.v1"

    init() {
        favorites = load(favoritesKey)
        recents = load(recentsKey)
    }

    func favorite(labeled label: String) -> SavedPlace? { favorites.first { $0.label == label } }

    func setFavorite(_ place: SavedPlace, label: String) {
        var p = place
        p.label = label
        p.id = "fav:\(label)"
        favorites.removeAll { $0.label == label }
        let order = ["Home": 0, "Work": 1]
        favorites.append(p)
        favorites.sort { (order[$0.label ?? ""] ?? 2, $0.title) < (order[$1.label ?? ""] ?? 2, $1.title) }
        save(favorites, favoritesKey)
    }

    func removeFavorite(_ place: SavedPlace) {
        favorites.removeAll { $0.id == place.id }
        save(favorites, favoritesKey)
    }

    func addRecent(_ place: SavedPlace) {
        guard place.label == nil else { return }
        recents.removeAll { $0.id == place.id || $0.name == place.name }
        recents.insert(place, at: 0)
        recents = Array(recents.prefix(12))
        save(recents, recentsKey)
    }

    func clearRecents() {
        recents = []
        save(recents, recentsKey)
    }

    private func load(_ key: String) -> [SavedPlace] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([SavedPlace].self, from: data)) ?? []
    }

    private func save(_ places: [SavedPlace], _ key: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(places), forKey: key)
    }
}
