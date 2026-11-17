import SwiftUI

/// The colored route pill: "B74" on zone green, "T163" on SITP blue.
struct RouteBadge: View {
    enum Size { case small, regular, large }

    let route: any RouteStyled
    var size: Size = .regular

    private var font: CGFloat { switch size { case .small: 13; case .regular: 16; case .large: 22 } }
    private var hPad: CGFloat { switch size { case .small: 6; case .regular: 8; case .large: 11 } }
    private var vPad: CGFloat { switch size { case .small: 2.5; case .regular: 4; case .large: 6 } }
    private var radius: CGFloat { switch size { case .small: 6; case .regular: 7; case .large: 10 } }

    var body: some View {
        HStack(spacing: 3) {
            if route.system == .cable {
                Image(systemName: "cablecar.fill").font(.system(size: font * 0.8, weight: .bold))
            }
            Text(route.badgeName)
                .font(.system(size: font, weight: .heavy, design: .rounded))
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(route.badgeTextColor)
        .padding(.horizontal, hPad)
        .padding(.vertical, vPad)
        .frame(minWidth: font * 2.1)
        .background(route.badgeColor, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
        .accessibilityLabel("\(route.system.label) \(route.badgeName)")
    }
}

/// Compact summary of an itinerary: walk · B75 › T163 · walk.
struct LegChips: View {
    let legs: [Leg]

    var body: some View {
        FlowLayout(spacing: 4, lineSpacing: 6) {
            ForEach(Array(visible.enumerated()), id: \.element.id) { index, leg in
                if index > 0 {
                    Image(systemName: "chevron.compact.right")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.tertiary)
                }
                if leg.isWalk {
                    HStack(spacing: 1) {
                        Image(systemName: "figure.walk")
                        Text("\(max(1, leg.duration / 60))")
                    }
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(.secondary)
                } else {
                    RouteBadge(route: leg, size: .small)
                }
            }
        }
    }

    /// Drop sub-minute walks (platform changes) so chips stay readable.
    private var visible: [Leg] {
        legs.filter { !$0.isWalk || $0.duration >= 90 }
    }
}

/// Station marker: white disk with the zone-colored ring (trunk) or a small blue dot (SITP stop).
struct StationGlyph: View {
    var color: Color
    var isTrunk: Bool
    var size: CGFloat = 14

    var body: some View {
        if isTrunk {
            Circle()
                .fill(.white)
                .overlay(Circle().stroke(color, lineWidth: size * 0.26))
                .frame(width: size, height: size)
                .shadow(color: .black.opacity(0.25), radius: 1.5, y: 1)
        } else {
            Circle()
                .fill(color)
                .overlay(Circle().stroke(.white, lineWidth: 1.5))
                .frame(width: size * 0.7, height: size * 0.7)
        }
    }
}

/// Transit-style pulsing arcs for real-time predictions.
struct LiveIndicator: View {
    @State private var on = false

    var body: some View {
        Image(systemName: "dot.radiowaves.up.forward")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Theme.go)
            .opacity(on ? 1 : 0.35)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever()) { on = true }
            }
    }
}

struct SectionLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .tracking(0.6)
            .foregroundStyle(.secondary)
    }
}
