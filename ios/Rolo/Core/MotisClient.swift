import CoreLocation
import Foundation

/// Thin client for a MOTIS 2 server: our own Bogotá router, or api.transitous.org.
nonisolated struct MotisClient: Sendable {
    let baseURL: URL

    enum APIError: LocalizedError {
        case badURL
        case http(Int, String)

        var errorDescription: String? {
            switch self {
            case .badURL: "The server address isn't a valid URL."
            case .http(let code, let body): "Server said \(code): \(body.prefix(140))"
            }
        }
    }

    static func placeParam(_ c: CLLocationCoordinate2D) -> String {
        String(format: "%.6f,%.6f", c.latitude, c.longitude)
    }

    func plan(from: String, to: String, time: Date?, arriveBy: Bool, cursor: String? = nil) async throws -> PlanResponse {
        var q = [URLQueryItem(name: "fromPlace", value: from), URLQueryItem(name: "toPlace", value: to)]
        if let time { q.append(.init(name: "time", value: time.formatted(.iso8601))) }
        if arriveBy { q.append(.init(name: "arriveBy", value: "true")) }
        if let cursor { q.append(.init(name: "pageCursor", value: cursor)) }
        return try await get("api/v5/plan", q)
    }

    /// Every departure from every stop within `radius` meters, over the next `window` seconds.
    func departures(near c: CLLocationCoordinate2D, radius: Int, window: Int, n: Int) async throws -> StopTimesResponse {
        try await get("api/v5/stoptimes", [
            .init(name: "center", value: Self.placeParam(c)),
            .init(name: "radius", value: String(radius)),
            .init(name: "exactRadius", value: "true"),
            .init(name: "window", value: String(window)),
            .init(name: "n", value: String(n)),
            .init(name: "time", value: AppClock.now.formatted(.iso8601)),
        ])
    }

    func departures(stopId: String, n: Int) async throws -> StopTimesResponse {
        try await get("api/v5/stoptimes", [
            .init(name: "stopId", value: stopId),
            .init(name: "n", value: String(n)),
            .init(name: "time", value: AppClock.now.formatted(.iso8601)),
        ])
    }

    func trip(id: String) async throws -> Itinerary {
        try await get("api/v5/trip", [.init(name: "tripId", value: id)])
    }

    func geocode(_ text: String, near: CLLocationCoordinate2D?) async throws -> [GeoMatch] {
        var q = [URLQueryItem(name: "text", value: text), URLQueryItem(name: "numResults", value: "15")]
        if let near {
            q.append(.init(name: "place", value: Self.placeParam(near)))
            q.append(.init(name: "placeBias", value: "2"))
        }
        return try await get("api/v1/geocode", q)
    }

    func reverseGeocode(_ c: CLLocationCoordinate2D) async throws -> [GeoMatch] {
        try await get("api/v1/reverse-geocode", [.init(name: "place", value: Self.placeParam(c))])
    }

    func ping() async -> Bool {
        (try? await geocode("Portal", near: nil)).map { !$0.isEmpty } ?? false
    }

    private func get<T: Decodable>(_ path: String, _ query: [URLQueryItem]) async throws -> T {
        guard var comps = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIError.badURL
        }
        comps.queryItems = query
        guard let url = comps.url else { throw APIError.badURL }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue("Rolo/0.1 (private Bogotá transit app)", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw APIError.http(http.statusCode, String(decoding: data, as: UTF8.self))
        }
        return try Self.makeDecoder().decode(T.self, from: data)
    }

    private static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = try? Date(raw, strategy: .iso8601) { return date }
            if let date = try? Date(raw, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unreadable date \(raw)")
        }
        return decoder
    }
}
