import SwiftUI

enum Theme {
    static let accent = Color(hex: "E8384F")
    static let go = Color(hex: "12A150")
    static let walk = Color(hex: "8E8E93")
    static let origin = Color(hex: "12A150")
    static let destination = Color(hex: "E8384F")

    /// Big countdown numbers: rounded, heavy, fixed-width digits so they don't jitter.
    static func number(_ size: CGFloat) -> Font {
        .system(size: size, weight: .heavy, design: .rounded).monospacedDigit()
    }

    static func zoneColor(_ letter: String, in network: NetworkData) -> Color {
        Color(hex: network.zoneColors[letter] ?? "E8384F")
    }
}

extension Color {
    nonisolated init(hex: String?, fallback: Color = .gray) {
        var s = (hex ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&v) else {
            self = fallback
            return
        }
        self = Color(red: Double((v >> 16) & 0xFF) / 255,
                     green: Double((v >> 8) & 0xFF) / 255,
                     blue: Double(v & 0xFF) / 255)
    }
}

extension RouteStyled {
    var badgeColor: Color { Color(hex: routeColor, fallback: Theme.accent) }
    var badgeTextColor: Color { Color(hex: routeTextColor, fallback: .white) }
}

/// Left-to-right wrapping layout for leg chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 5
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, maxWidth), height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        // Group into lines first so each line can be vertically centered.
        var lines: [[(LayoutSubviews.Element, CGSize)]] = [[]]
        var x: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > bounds.width {
                lines.append([])
                x = 0
            }
            lines[lines.count - 1].append((view, size))
            x += size.width + spacing
        }
        var y = bounds.minY
        for line in lines {
            let height = line.map(\.1.height).max() ?? 0
            var lx = bounds.minX
            for (view, size) in line {
                view.place(at: CGPoint(x: lx, y: y + (height - size.height) / 2), proposal: ProposedViewSize(size))
                lx += size.width + spacing
            }
            y += height + lineSpacing
        }
    }
}
