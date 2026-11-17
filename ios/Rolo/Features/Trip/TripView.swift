import SwiftUI

/// One vehicle's run: every stop it makes, with your boarding stop highlighted.
struct TripView: View {
    @Environment(AppModel.self) private var app
    let ref: TripRef
    @State private var leg: Leg?
    @State private var errorText: String?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 12) {
                        RouteBadge(route: ref.route, size: .large)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ref.destination).font(.system(size: 20, weight: .bold)).lineLimit(2)
                            Text(ref.route.system.label).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.bottom, 20)

                    if let leg {
                        let stops = leg.allStops
                        let boardingIndex = stops.firstIndex { $0.stopId == ref.boardingStopId } ?? 0
                        ForEach(Array(stops.enumerated()), id: \.offset) { index, stop in
                            StopTimelineRow(
                                stop: stop,
                                time: index == 0 ? leg.startTime : (index == stops.count - 1 ? leg.endTime : (stop.departure ?? stop.arrival)),
                                color: leg.badgeColor,
                                isFirst: index == 0,
                                isLast: index == stops.count - 1,
                                isBoarding: index == boardingIndex,
                                isPast: index < boardingIndex)
                            .id(index)
                        }
                        .onAppear {
                            proxy.scrollTo(max(0, boardingIndex - 1), anchor: .top)
                        }
                    } else if let errorText {
                        Text(errorText).font(.subheadline).foregroundStyle(.secondary)
                    } else {
                        HStack { Spacer(); ProgressView().padding(.vertical, 30); Spacer() }
                    }
                }
                .padding(18)
            }
            .scrollIndicators(.hidden)
        }
        .navigationTitle(ref.route.badgeName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onAppear { if let leg { app.mapFocus = .trip(leg, boardingStopId: ref.boardingStopId) } }
    }

    private func load() async {
        guard leg == nil else { return }
        do {
            let itinerary = try await app.client.trip(id: ref.tripId)
            guard let found = itinerary.legs.first(where: \.isTransit) ?? itinerary.legs.first else { return }
            leg = found
            app.mapFocus = .trip(found, boardingStopId: ref.boardingStopId)
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
            errorText = error.localizedDescription
        }
    }
}

private struct StopTimelineRow: View {
    let stop: Place
    let time: Date?
    let color: Color
    let isFirst: Bool
    let isLast: Bool
    let isBoarding: Bool
    let isPast: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(time.map(Fmt.clock) ?? "")
                .font(.system(size: 13, weight: isBoarding ? .heavy : .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(isBoarding ? .primary : .secondary)
                .frame(width: 62, alignment: .trailing)

            VStack(spacing: 0) {
                Rectangle().fill(color.opacity(isFirst ? 0 : (isPast ? 0.35 : 1))).frame(width: 7).frame(maxHeight: .infinity)
                Circle()
                    .fill(.background)
                    .overlay(Circle().stroke(color, lineWidth: isBoarding ? 5 : 3))
                    .frame(width: isBoarding ? 20 : 13, height: isBoarding ? 20 : 13)
                Rectangle().fill(color.opacity(isLast ? 0 : (isPast ? 0.35 : 1))).frame(width: 7).frame(maxHeight: .infinity)
            }
            .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(Bogota.stationName(stop.name))
                    .font(.system(size: isBoarding ? 17 : 15, weight: isBoarding ? .bold : .regular))
                    .lineLimit(1)
                if isBoarding {
                    let boarding = Bogota.boarding(name: stop.name, code: stop.stopCode)
                    Text(["You board here", boarding?.text].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(color)
                }
            }
            .padding(.vertical, isBoarding ? 10 : 7)
            Spacer(minLength: 0)
        }
        .opacity(isPast ? 0.45 : 1)
        .fixedSize(horizontal: false, vertical: true)
    }
}
