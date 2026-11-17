import SwiftUI

/// Step-by-step view of one itinerary: a vertical timeline with a colored rail per leg.
struct ItineraryDetailView: View {
    @Environment(AppModel.self) private var app
    let itinerary: Itinerary
    @State private var expanded: Set<String> = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        DurationText(seconds: itinerary.duration)
                        Text(summary).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 15)) { context in
                        LeaveIn(date: itinerary.startTime, now: AppClock.shift(context.date))
                    }
                }
                .padding(.bottom, 20)

                ForEach(Array(itinerary.legs.enumerated()), id: \.element.id) { index, leg in
                    LegTimelineRow(
                        leg: leg,
                        startName: index == 0 ? originName : Bogota.stationName(leg.from.name),
                        expanded: Binding(
                            get: { expanded.contains(leg.id) },
                            set: { if $0 { expanded.insert(leg.id) } else { expanded.remove(leg.id) } }))
                }

                if let last = itinerary.legs.last {
                    EndpointTimelineRow(time: last.endTime, name: app.tripRequest?.to.title ?? Bogota.stationName(last.to.name))
                }
            }
            .padding(18)
        }
        .scrollIndicators(.hidden)
        .navigationTitle("Your trip")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { app.mapFocus = .itinerary(itinerary) }
    }

    private var originName: String { app.tripRequest?.from?.title ?? app.hereLabel }

    private var summary: String {
        var parts = ["Arrive \(Fmt.clock(itinerary.endTime))"]
        switch itinerary.transfers {
        case 0: parts.append(itinerary.transitLegs.isEmpty ? "walking" : "no transfers")
        case 1: parts.append("1 transfer")
        default: parts.append("\(itinerary.transfers) transfers")
        }
        let walk = itinerary.walkSeconds / 60
        if walk > 0, !itinerary.transitLegs.isEmpty { parts.append("\(walk) min walk") }
        return parts.joined(separator: " · ")
    }
}

private struct LegTimelineRow: View {
    let leg: Leg
    let startName: String
    @Binding var expanded: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(Fmt.clock(leg.startTime))
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(width: 62, alignment: .trailing)
                .padding(.top, 2)

            VStack(spacing: 0) {
                Circle()
                    .fill(.background)
                    .overlay(Circle().stroke(leg.isWalk ? Theme.walk : leg.badgeColor, lineWidth: 3.5))
                    .frame(width: 15, height: 15)
                if leg.isWalk {
                    DottedLine()
                        .stroke(Theme.walk, style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [0.5, 7]))
                        .frame(width: 4)
                        .frame(maxHeight: .infinity)
                } else {
                    Rectangle()
                        .fill(leg.badgeColor)
                        .frame(width: 7)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 16)

            VStack(alignment: .leading, spacing: 7) {
                Text(startName)
                    .font(.system(size: 16, weight: .bold))
                    .lineLimit(2)
                if leg.isWalk { walkBody } else { transitBody }
            }
            .padding(.bottom, 22)
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var walkBody: some View {
        let meters = leg.distance.map { " · \(Fmt.distance($0))" } ?? ""
        let text = leg.duration < 90 ? "Transfer on foot · 1 min" : "Walk \(Fmt.duration(leg.duration))\(meters)"
        return Label(text, systemImage: "figure.walk")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.vertical, 6)
    }

    @ViewBuilder
    private var transitBody: some View {
        HStack(spacing: 8) {
            RouteBadge(route: leg)
            Text(Bogota.destination(routeLongName: leg.routeLongName, tripTo: leg.tripTo?.name, tripFrom: leg.tripFrom?.name))
                .font(.system(size: 16, weight: .semibold))
                .lineLimit(1)
        }
        if let boarding = Bogota.boarding(name: leg.from.name, code: leg.from.stopCode), !boarding.text.isEmpty {
            Label(boarding.text, systemImage: "door.left.hand.open")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(leg.badgeColor)
        }
        let stops = (leg.intermediateStops?.count ?? 0) + 1
        Button {
            withAnimation(.snappy) { expanded.toggle() }
        } label: {
            HStack(spacing: 4) {
                Text("\(stops) stop\(stops == 1 ? "" : "s") · \(Fmt.duration(leg.duration))")
                if stops > 1 {
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold))
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .disabled(stops <= 1)
        if expanded {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array((leg.intermediateStops ?? []).enumerated()), id: \.offset) { _, stop in
                    HStack {
                        Text(Bogota.stationName(stop.name)).font(.subheadline)
                        Spacer()
                        if let t = stop.departure ?? stop.arrival {
                            Text(Fmt.clock(t)).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(.top, 2)
        }
        Text("Get off at \(Bogota.stationName(leg.to.name))")
            .font(.subheadline.weight(.semibold))
            .padding(.top, 2)
    }
}

private struct EndpointTimelineRow: View {
    let time: Date
    let name: String

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(Fmt.clock(time))
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(width: 62, alignment: .trailing)
            Circle()
                .fill(Theme.destination)
                .overlay(Circle().stroke(.white, lineWidth: 3))
                .frame(width: 16, height: 16)
            Text(name).font(.system(size: 16, weight: .bold)).lineLimit(2)
            Spacer()
        }
    }
}

nonisolated struct DottedLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY + 6))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        return p
    }
}
