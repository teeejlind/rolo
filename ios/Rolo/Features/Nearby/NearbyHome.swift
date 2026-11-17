import SwiftUI

/// The sheet's home: search, saved places, and live departures around you.
struct NearbyHome: View {
    @Environment(AppModel.self) private var app
    @State private var model = NearbyModel()
    @State private var expanded: Set<String> = []

    var body: some View {
        @Bindable var model = model
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    Button {
                        app.detent = SheetDetent.full
                        app.open(.search(.destination))
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "magnifyingglass").font(.system(size: 17, weight: .bold))
                            Text("Where to?").font(.system(size: 19, weight: .bold, design: .rounded))
                            Spacer()
                        }
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 13)
                        .background(Color.primary.opacity(0.07), in: Capsule())
                    }
                    .buttonStyle(.plain)

                    Button { app.open(.settings) } label: {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .frame(width: 44, height: 44)
                            .background(Color.primary.opacity(0.07), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Settings")
                }

                FavoritesRow()

                if !app.inBogota { AwayBanner() }

                Picker("Show", selection: $model.filter) {
                    ForEach(NearbyFilter.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)

                if model.loading {
                    HStack { Spacer(); ProgressView().padding(.vertical, 40); Spacer() }
                } else if let error = model.errorText, model.stations.isEmpty {
                    ServerErrorCard(message: error) { Task { await model.load(app: app) } }
                } else {
                    let stations = model.visibleStations()
                    if stations.isEmpty {
                        Text("Nothing leaving nearby in the next hour.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 30)
                    }
                    ForEach(stations) { station in
                        StationCard(station: station, expanded: Binding(
                            get: { expanded.contains(station.id) },
                            set: { if $0 { expanded.insert(station.id) } else { expanded.remove(station.id) } }))
                    }
                    if let updated = model.updated {
                        Text("Scheduled times · updated \(Fmt.clock(updated))")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 20)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: refreshKey) { await model.run(app: app) }
        .onAppear { app.mapFocus = .nearby }
    }

    /// Reload when you move ~100 m or switch servers.
    private var refreshKey: String {
        "\(Int(app.here.latitude * 1000))|\(Int(app.here.longitude * 1000))|\(app.server.urlString)"
    }
}

private struct FavoritesRow: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                slot("Home")
                slot("Work")
                ForEach(app.store.favorites.filter { $0.label != "Home" && $0.label != "Work" }) { place in
                    chip(place)
                }
                Button {
                    app.detent = SheetDetent.full
                    app.open(.search(.favorite("")))
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .frame(width: 36, height: 36)
                        .background(Color.primary.opacity(0.07), in: Circle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Add a favorite")
            }
        }
        .scrollIndicators(.hidden)
    }

    @ViewBuilder
    private func slot(_ label: String) -> some View {
        if let place = app.store.favorite(labeled: label) {
            chip(place)
        } else {
            Button {
                app.detent = SheetDetent.full
                app.open(.search(.favorite(label)))
            } label: {
                Label("Set \(label)", systemImage: label == "Home" ? "house" : "briefcase")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .background(Color.primary.opacity(0.05), in: Capsule())
                    .overlay(Capsule().strokeBorder(Color.primary.opacity(0.12), style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
    }

    private func chip(_ place: SavedPlace) -> some View {
        Button { app.plan(to: place) } label: {
            Label(place.title, systemImage: place.symbol)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .lineLimit(1)
                .padding(.horizontal, 13)
                .padding(.vertical, 9)
                .background(Theme.accent.opacity(0.12), in: Capsule())
                .foregroundStyle(Theme.accent)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("Remove", systemImage: "trash", role: .destructive) { app.store.removeFavorite(place) }
        }
    }
}

private struct AwayBanner: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "airplane.departure").foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text("Not in Bogotá right now").font(.subheadline.weight(.bold))
                Text("Showing \(app.demoSpot.name)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Menu {
                Picker("Pretend I'm at", selection: Binding(get: { app.demoSpot }, set: { app.setDemoSpot($0) })) {
                    ForEach(DemoSpot.allCases) { Text($0.name).tag($0) }
                }
            } label: {
                Text("Change").font(.subheadline.weight(.semibold))
            }
        }
        .padding(12)
        .background(Theme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct ServerErrorCard: View {
    @Environment(AppModel.self) private var app
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(message.hasPrefix("Server said") ? "The trip planner hit a snag" : "Can't reach the trip planner",
                  systemImage: "wifi.exclamationmark")
                .font(.headline)
            Text(app.server.urlString).font(.caption.monospaced()).foregroundStyle(.secondary)
            Text(message).font(.caption).foregroundStyle(.secondary).lineLimit(3)
            HStack {
                Button("Try again", action: retry).buttonStyle(.borderedProminent)
                Button("Settings") { app.open(.settings) }.buttonStyle(.bordered)
            }
            .padding(.top, 4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct StationCard: View {
    @Environment(AppModel.self) private var app
    let station: NearbyStation
    @Binding var expanded: Bool

    private let collapsedCount = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                StationGlyph(color: station.isTrunk ? stationColor : Color(hex: "1D63B8"), isTrunk: station.isTrunk, size: 14)
                Text(station.name)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .lineLimit(1)
                Spacer(minLength: 6)
                Text(Fmt.walk(station.distance))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 6)

            ForEach(shown) { route in
                Button { openTrip(route) } label: { NearbyRouteRow(route: route) }
                    .buttonStyle(.plain)
                if route.id != shown.last?.id {
                    Divider().padding(.leading, 70)
                }
            }

            if station.routes.count > collapsedCount {
                Button {
                    withAnimation(.snappy) { expanded.toggle() }
                } label: {
                    Text(expanded ? "Show fewer" : "\(station.routes.count - collapsedCount) more routes")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.accent)
            }
        }
        .padding(14)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var shown: [NearbyRoute] {
        expanded ? station.routes : Array(station.routes.prefix(collapsedCount))
    }

    private var stationColor: Color {
        guard let s = app.network.station(id: station.id) else {
            return station.routes.first?.route.badgeColor ?? Theme.accent
        }
        return Theme.zoneColor(s.letter, in: app.network)
    }

    private func openTrip(_ route: NearbyRoute) {
        guard let first = route.departures.first else { return }
        app.open(.trip(TripRef(tripId: first.stopTime.tripId, boardingStopId: first.stopTime.place.stopId,
                               route: route.route, destination: route.destination)))
    }
}

private struct NearbyRouteRow: View {
    let route: NearbyRoute

    var body: some View {
        HStack(spacing: 12) {
            RouteBadge(route: route.route)
                .frame(width: 58, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(route.destination)
                    .font(.system(size: 16, weight: .semibold))
                    .lineLimit(1)
                Text(route.boarding.map(\.text).flatMap { $0.isEmpty ? nil : $0 } ?? route.system.label)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            TimelineView(.periodic(from: .now, by: 10)) { context in
                DepartureTimes(departures: route.departures, now: AppClock.shift(context.date))
            }
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }
}

struct DepartureTimes: View {
    let departures: [NearbyDeparture]
    let now: Date

    var body: some View {
        let upcoming = departures.filter { $0.time > now.addingTimeInterval(-30) }
        VStack(alignment: .trailing, spacing: 0) {
            if let first = upcoming.first {
                let m = Fmt.minutes(until: first.time, from: now)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    if first.isRealtime { LiveIndicator() }
                    if m == 0 {
                        Text("Now").font(Theme.number(22)).foregroundStyle(Theme.accent)
                    } else if m >= 60 {
                        Text(Fmt.clock(first.time)).font(Theme.number(17))
                    } else {
                        Text("\(m)").font(Theme.number(26))
                        Text("min").font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                let later = upcoming.dropFirst().prefix(2).map { d in
                    let mm = Fmt.minutes(until: d.time, from: now)
                    return mm >= 60 ? Fmt.clock(d.time) : "\(mm)"
                }
                if !later.isEmpty {
                    Text(later.joined(separator: ", ") + (later.allSatisfy { $0.allSatisfy(\.isNumber) } ? " min" : ""))
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("—").foregroundStyle(.tertiary)
            }
        }
    }
}
