import SwiftUI

struct SearchView: View {
    @Environment(AppModel.self) private var app
    let purpose: SearchPurpose

    @State private var text = ""
    @State private var results: [GeoMatch] = []
    @State private var searching = false
    @State private var errorText: String?
    @FocusState private var focused: Bool

    var body: some View {
        List {
            if query.isEmpty {
                if purpose == .origin {
                    Button { choose(nil) } label: {
                        PlaceRow(symbol: "location.fill", tint: .blue, title: app.hereLabel, subtitle: app.inBogota ? nil : "Stand-in while you're away")
                    }
                }
                if !app.store.favorites.isEmpty, !isSavingFavorite {
                    Section { ForEach(app.store.favorites) { savedRow($0) } } header: { SectionLabel(text: "Saved") }
                }
                if !app.store.recents.isEmpty {
                    Section {
                        ForEach(app.store.recents) { savedRow($0) }
                    } header: {
                        HStack {
                            SectionLabel(text: "Recent")
                            Spacer()
                            Button("Clear") { app.store.clearRecents() }.font(.caption.weight(.semibold))
                        }
                    }
                }
                if app.store.recents.isEmpty, app.store.favorites.isEmpty {
                    Section {
                        Text("Try a station (Calle 72), a place (Andino), or an address (Calle 85 # 11).")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                ForEach(stationHits) { station in
                    Button { choose(SavedPlace(station: station)) } label: {
                        PlaceRow(symbol: "bus.fill", tint: Theme.zoneColor(station.letter, in: app.network),
                                 title: station.name, subtitle: "Estación TransMilenio · Zona \(station.letter)")
                    }
                    .contextMenu {
                        Button("Save as Home", systemImage: "house") { app.store.setFavorite(SavedPlace(station: station), label: "Home") }
                        Button("Save as Work", systemImage: "briefcase") { app.store.setFavorite(SavedPlace(station: station), label: "Work") }
                        Button("Add to favorites", systemImage: "star") { app.store.setFavorite(SavedPlace(station: station), label: station.name) }
                    }
                }
                ForEach(geoResults) { match in
                    Button { choose(SavedPlace(match: match)) } label: { matchRow(match) }
                        .contextMenu {
                            Button("Save as Home", systemImage: "house") { save(match, "Home") }
                            Button("Save as Work", systemImage: "briefcase") { save(match, "Work") }
                            Button("Add to favorites", systemImage: "star") { save(match, "") }
                        }
                }
                if let errorText {
                    Text(errorText).font(.caption).foregroundStyle(.secondary)
                } else if results.isEmpty, stationHits.isEmpty, !searching {
                    ContentUnavailableView.search(text: query)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always), prompt: prompt)
        .searchFocused($focused)
        .autocorrectionDisabled()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            app.detent = SheetDetent.full
            focused = true
        }
        .task(id: query) { await search() }
    }

    private var query: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var stationHits: [NetworkData.Station] { app.network.search(query) }

    /// Geocoder results minus trunk platforms already covered by a station hit.
    private var geoResults: [GeoMatch] {
        let covered = Set(stationHits.map(\.id))
        return results.filter { m in
            guard m.isStop, let trunk = app.network.station(id: m.matchId) else { return true }
            return !covered.contains(trunk.id)
        }
    }
    private var isSavingFavorite: Bool { if case .favorite = purpose { true } else { false } }

    private var title: String {
        switch purpose {
        case .destination: "Where to?"
        case .origin: "Starting from"
        case .favorite(let label): label.isEmpty ? "Add a favorite" : "Set \(label)"
        }
    }

    private var prompt: String { "Station, place, or address" }

    private func search() async {
        guard !query.isEmpty else { results = []; return }
        try? await Task.sleep(for: .milliseconds(220))
        guard !Task.isCancelled else { return }
        searching = true
        defer { searching = false }
        do {
            results = try await app.client.geocode(query, near: app.here)
            errorText = nil
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
            errorText = error.localizedDescription
        }
    }

    private func choose(_ place: SavedPlace?) {
        switch purpose {
        case .destination:
            if let place { app.plan(to: place) }
        case .origin:
            if var request = app.tripRequest {
                request.from = place
                app.tripRequest = request
            }
            pop()
        case .favorite(let label):
            if let place { app.store.setFavorite(place, label: label.isEmpty ? place.name : label) }
            pop()
            app.detent = SheetDetent.mid
        }
    }

    private func save(_ match: GeoMatch, _ label: String) {
        let place = SavedPlace(match: match)
        app.store.setFavorite(place, label: label.isEmpty ? place.name : label)
    }

    private func pop() {
        if !app.path.isEmpty { app.path.removeLast() }
    }

    private func savedRow(_ place: SavedPlace) -> some View {
        Button { choose(place) } label: {
            PlaceRow(symbol: place.symbol, tint: place.label == nil ? .secondary : Theme.accent,
                     title: place.title, subtitle: place.label == nil ? place.subtitle : place.name)
        }
    }

    private func matchRow(_ m: GeoMatch) -> some View {
        let trunk = m.isStop ? app.network.station(id: m.matchId) : nil
        let symbol = m.isStop ? "bus.fill" : (m.type == "ADDRESS" ? "mappin" : "building.2.fill")
        let tint: Color = trunk.map { Theme.zoneColor($0.letter, in: app.network) } ?? (m.isStop ? Color(hex: "1D63B8") : .secondary)
        let kind = trunk != nil ? "Estación TransMilenio" : (m.isStop ? "SITP stop" : nil)
        let subtitle = [kind, m.areaLine].compactMap { $0 }.joined(separator: " · ")
        return PlaceRow(symbol: symbol, tint: tint, title: m.isStop ? Bogota.stationName(m.name) : m.name,
                        subtitle: subtitle.isEmpty ? nil : subtitle)
    }
}

struct PlaceRow: View {
    let symbol: String
    let tint: Color
    let title: String
    let subtitle: String?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(tint, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(.primary).lineLimit(1)
                if let subtitle {
                    Text(subtitle).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }
}
