import CoreLocation
import Foundation

/// Bogotá-specific knowledge: time zone, city bounds, how TransMilenio names things.
nonisolated enum Bogota {
    static let timeZone = TimeZone(identifier: "America/Bogota")!

    /// Bogotá + Soacha + the northern suburbs the feed reaches.
    static func contains(_ c: CLLocationCoordinate2D) -> Bool {
        (4.40...4.90).contains(c.latitude) && (-74.30 ... -73.95).contains(c.longitude)
    }

    // "Av. Jiménez E - 2 ó 5", "Calle 72 C - 4", "Calle 72 C - 2." -> wagon + doors
    nonisolated(unsafe) private static let wagonPattern =
        try! Regex(#"\s([A-Z])\s*-\s*(\d+(?:\s*(?:ó|o|y|,|/)\s*\d+)*)\.?\s*$"#)
    // "Portal Tunal T2", "Portal Usme T4D", "Banderas T8" -> portal bay
    nonisolated(unsafe) private static let bayPattern = try! Regex(#"\s(T\d+[A-Z]?)\s*$"#)

    static func boarding(name: String, code: String?) -> Boarding? {
        for text in [name, code ?? ""] {
            let padded = " " + text
            if let m = padded.firstMatch(of: wagonPattern),
               let wagon = m.output[1].substring, let doorText = m.output[2].substring {
                let doors = doorText.split(whereSeparator: { !$0.isNumber }).map(String.init)
                return Boarding(wagon: String(wagon), doors: doors, bay: nil)
            }
            if let m = padded.firstMatch(of: bayPattern), let bay = m.output[1].substring {
                return Boarding(wagon: nil, doors: [], bay: String(bay))
            }
        }
        return nil
    }

    /// Platform name -> station name: strips the wagon/door and bay suffixes, and spells out
    /// SITP street-code stop names ("CL72 - K10" -> "Calle 72 & Carrera 10").
    static func stationName(_ raw: String) -> String {
        var s = " " + raw
        if let m = s.firstMatch(of: wagonPattern) { s.removeSubrange(m.range) }
        if let m = s.firstMatch(of: bayPattern) { s.removeSubrange(m.range) }
        s = s.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return spellOutStreets(s)
    }

    nonisolated(unsafe) private static let streetCode =
        try! Regex(#"^(AC|AK|CL|CLL|KR|CR|K|DG|TV|AV)\s?\.?\s?(\d+\s?[A-Z]?(?:\s?BIS)?(?:\s?SUR)?)\.?$"#)

    private static func spellOutStreets(_ s: String) -> String {
        let parts = s.components(separatedBy: " - ")
        guard parts.count == 2 else { return s }
        let spelled = parts.map { part -> String? in
            let p = part.trimmingCharacters(in: CharacterSet(charactersIn: " ."))
            guard let m = p.uppercased().firstMatch(of: streetCode),
                  let kind = m.output[1].substring, let number = m.output[2].substring else { return nil }
            let name = switch kind {
            case "AC": "Av. Calle"
            case "AK": "Av. Carrera"
            case "CL", "CLL": "Calle"
            case "KR", "CR", "K": "Carrera"
            case "DG": "Diagonal"
            case "TV": "Transversal"
            default: "Av."
            }
            return "\(name) \(number.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "BIS", with: " Bis").replacingOccurrences(of: "SUR", with: " Sur"))"
        }
        guard spelled.allSatisfy({ $0 != nil }) else { return s }
        return spelled.compactMap { $0 }.joined(separator: " & ")
    }

    /// The export's route_long_name is the destination, sometimes abbreviated ("P.USME", "P. 80").
    /// Zonal names like "A427 Centro Andino || F427 Calandaima" list both ends of the route: for
    /// loops (trip starts and ends at the same stop) we show both, otherwise the end the trip reaches.
    static func destination(routeLongName: String?, tripTo: String?, tripFrom: String? = nil) -> String {
        var s = (routeLongName ?? "").trimmingCharacters(in: .whitespaces)
        if s.contains("||") {
            let halves = s.components(separatedBy: "||").map(stripRouteCode).filter { !$0.isEmpty }
            let end = stationName(tripTo ?? "")
            let isLoop = tripFrom != nil && tripFrom == tripTo
            if !isLoop, let best = halves.max(by: { overlap($0, end) < overlap($1, end) }), overlap(best, end) > 0 {
                s = best
            } else {
                return halves.map(tidy).joined(separator: " ⇄ ")
            }
        }
        if s.isEmpty { s = stationName(tripTo ?? "") }
        return tidy(s)
    }

    private static func tidy(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("P.") { s = "Portal " + s.dropFirst(2).trimmingCharacters(in: .whitespaces) }
        if s == s.uppercased(), s.count > 3 {
            let small: Set<String> = ["de", "del", "la", "las", "los", "el", "y"]
            s = s.capitalized.split(separator: " ").enumerated()
                .map { i, w in i > 0 && small.contains(w.lowercased()) ? w.lowercased() : String(w) }
                .joined(separator: " ")
        }
        return s.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// "A427 Centro Andino" -> "Centro Andino"
    private static func stripRouteCode(_ raw: String) -> String {
        let words = raw.split(whereSeparator: \.isWhitespace)
        guard let first = words.first, words.count > 1,
              first.first?.isLetter == true, first.contains(where: \.isNumber) else {
            return words.joined(separator: " ")
        }
        return words.dropFirst().joined(separator: " ")
    }

    private static func overlap(_ a: String, _ b: String) -> Int {
        func words(_ s: String) -> Set<String> {
            Set(s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
                .split(whereSeparator: { !$0.isLetter }).map(String.init).filter { $0.count >= 4 })
        }
        return words(a).intersection(words(b)).count
    }
}

/// Where to stand in a TransMilenio station: wagon (vagón) + door (puerta), or a portal bay.
nonisolated struct Boarding: Hashable, Sendable {
    var wagon: String?
    var doors: [String]
    var bay: String?

    var text: String {
        if let bay { return "Plataforma \(bay)" }
        guard let wagon else { return "" }
        switch doors.count {
        case 0: return "Vagón \(wagon)"
        case 1: return "Vagón \(wagon) · Puerta \(doors[0])"
        default: return "Vagón \(wagon) · Puertas \(doors.joined(separator: " ó "))"
        }
    }
}

nonisolated enum TransitSystem: Int, Hashable, Sendable, Comparable {
    case troncal, dual, cable, alimentador, urbano, complementario, especial, other

    init(agencyName: String?) {
        let n = (agencyName ?? "").lowercased()
        if n.contains("troncal") { self = .troncal }
        else if n.contains("dual") { self = .dual }
        else if n.contains("cable") { self = .cable }
        else if n.contains("aliment") { self = .alimentador }
        else if n.contains("complement") { self = .complementario }
        else if n.contains("especial") { self = .especial }
        else if n.contains("urban") { self = .urbano }
        else { self = .other }
    }

    static func < (a: Self, b: Self) -> Bool { a.rawValue < b.rawValue }

    var label: String {
        switch self {
        case .troncal: "TransMilenio"
        case .dual: "Dual"
        case .cable: "TransMiCable"
        case .alimentador: "Alimentador"
        case .urbano: "SITP"
        case .complementario: "SITP Complementario"
        case .especial: "SITP Especial"
        case .other: "Bus"
        }
    }

    var symbol: String { self == .cable ? "cablecar.fill" : "bus.fill" }
    var isTransMilenio: Bool { [.troncal, .dual, .cable, .alimentador].contains(self) }
}

/// Anything that carries GTFS route styling (legs, departures).
nonisolated protocol RouteStyled {
    var routeShortName: String? { get }
    var routeLongName: String? { get }
    var routeColor: String? { get }
    var routeTextColor: String? { get }
    var agencyName: String? { get }
}

nonisolated extension RouteStyled {
    var system: TransitSystem { TransitSystem(agencyName: agencyName) }
    var badgeName: String {
        let s = (routeShortName ?? "").trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? system.label : s
    }
}

extension Leg: RouteStyled {}
extension StopTime: RouteStyled {}

nonisolated struct RouteInfo: Hashable, Sendable, RouteStyled {
    var routeShortName: String?
    var routeLongName: String?
    var routeColor: String?
    var routeTextColor: String?
    var agencyName: String?

    init(_ r: some RouteStyled) {
        routeShortName = r.routeShortName
        routeLongName = r.routeLongName
        routeColor = r.routeColor
        routeTextColor = r.routeTextColor
        agencyName = r.agencyName
    }
}
