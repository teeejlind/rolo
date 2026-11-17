import Foundation

/// All clock times render in Bogotá time, whatever time zone the phone is set to.
nonisolated enum Fmt {
    static func clock(_ date: Date) -> String {
        var style = Date.FormatStyle(date: .omitted, time: .shortened)
        style.timeZone = Bogota.timeZone
        return date.formatted(style)
    }

    static func minutes(until date: Date, from now: Date = .now) -> Int {
        max(0, Int((date.timeIntervalSince(now) / 60).rounded(.down)))
    }

    static func duration(_ seconds: Int) -> String {
        let m = Int((Double(seconds) / 60).rounded())
        if m < 60 { return "\(m) min" }
        return m % 60 == 0 ? "\(m / 60) h" : "\(m / 60) h \(m % 60)"
    }

    static func distance(_ meters: Double) -> String {
        meters < 950 ? "\(Int((meters / 10).rounded()) * 10) m" : String(format: "%.1f km", meters / 1000)
    }

    /// Walking time at an unhurried 1.2 m/s.
    static func walk(_ meters: Double) -> String {
        "\(max(1, Int((meters / 1.2 / 60).rounded()))) min walk"
    }
}
