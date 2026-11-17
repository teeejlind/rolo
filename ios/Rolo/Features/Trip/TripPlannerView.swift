import SwiftUI

struct TripPlannerView: View {
    @Environment(AppModel.self) private var app
    @State private var itineraries: [Itinerary] = []
    @State private var nextCursor: String?
    @State private var loading = false
    @State private var errorText: String?

    var body: some View {
        if let request = app.tripRequest {
            List {
                Section {
                    EndpointsCard(request: request)
                    WhenRow(request: request)
                }
                Section {
                    if loading, itineraries.isEmpty {
                        HStack { Spacer(); ProgressView().padding(.vertical, 24); Spacer() }
                    }
                    ForEach(itineraries) { itinerary in
                        Button { app.open(.itinerary(itinerary)) } label: { ItineraryRow(itinerary: itinerary) }
                            .buttonStyle(.plain)
                    }
                    if let errorText {
                        Text(errorText).font(.subheadline).foregroundStyle(.secondary)
                    } else if !loading, itineraries.isEmpty {
                        Text("No trips found. Try a different time, or a nearby station.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let nextCursor, !itineraries.isEmpty {
                        Button {
                            Task { await load(request, cursor: nextCursor) }
                        } label: {
                            Label("Later trips", systemImage: "clock.arrow.circlepath")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .navigationTitle(request.to.title)
            .navigationBarTitleDisplayMode(.inline)
            .task(id: request) { await load(request, cursor: nil) }
            .onAppear {
                if let first = itineraries.first { app.mapFocus = .itinerary(first) }
            }
        }
    }

    private func load(_ request: TripRequest, cursor: String?) async {
        loading = true
        defer { loading = false }
        if cursor == nil { itineraries = [] }
        let from = request.from?.placeParam ?? MotisClient.placeParam(app.here)
        var time: Date?
        var arriveBy = false
        switch request.when {
        case .now: time = AppClock.offset == 0 ? nil : AppClock.now
        case .departAt(let d): time = d
        case .arriveBy(let d): time = d; arriveBy = true
        }
        do {
            let response = try await app.client.plan(from: from, to: request.to.placeParam, time: time, arriveBy: arriveBy, cursor: cursor)
            var found = response.itineraries.filter { !$0.transitLegs.isEmpty }
            // A walk-only option is worth showing when it's competitive.
            if let walk = response.direct?.first, walk.duration <= (found.first?.duration ?? .max) + 600 {
                found.insert(walk, at: 0)
            }
            let merged = cursor == nil ? found : itineraries + found
            var seen = Set<String>()
            itineraries = merged.filter { seen.insert($0.id).inserted }.sorted { $0.endTime < $1.endTime }
            nextCursor = response.nextPageCursor
            errorText = nil
            if cursor == nil, let first = itineraries.first { app.mapFocus = .itinerary(first) }
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
            errorText = error.localizedDescription
        }
    }
}

private struct EndpointsCard: View {
    @Environment(AppModel.self) private var app
    let request: TripRequest

    var body: some View {
        HStack(spacing: 12) {
            VStack(spacing: 3) {
                Circle().fill(Theme.origin).frame(width: 10, height: 10)
                ForEach(0..<3) { _ in Circle().fill(.tertiary).frame(width: 3, height: 3) }
                Circle().fill(Theme.destination).frame(width: 10, height: 10)
            }
            VStack(alignment: .leading, spacing: 0) {
                Button { app.open(.search(.origin)) } label: {
                    endpoint(request.from?.title ?? app.hereLabel, caption: "From")
                }
                Divider().padding(.vertical, 8)
                Button { app.open(.search(.destination)) } label: {
                    endpoint(request.to.title, caption: "To")
                }
            }
            .buttonStyle(.plain)
            Button(action: swap) {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 15, weight: .bold))
                    .frame(width: 36, height: 36)
                    .background(Color.primary.opacity(0.07), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Swap start and destination")
        }
        .padding(.vertical, 4)
    }

    private func endpoint(_ title: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(caption).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
            Text(title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func swap() {
        guard var r = app.tripRequest else { return }
        let here = SavedPlace(id: "here", name: app.hereLabel, coordinate: app.here)
        let newFrom = r.to
        r.to = r.from ?? here
        r.from = newFrom
        app.tripRequest = r
    }
}

private struct WhenRow: View {
    @Environment(AppModel.self) private var app
    let request: TripRequest

    private enum Mode: String, CaseIterable { case now = "Now", depart = "Depart", arrive = "Arrive" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("When", selection: modeBinding) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            if mode != .now {
                DatePicker(mode == .depart ? "Leave at" : "Arrive by", selection: dateBinding,
                           displayedComponents: [.date, .hourAndMinute])
                    .environment(\.timeZone, Bogota.timeZone)
            }
        }
    }

    private var mode: Mode {
        switch request.when {
        case .now: .now
        case .departAt: .depart
        case .arriveBy: .arrive
        }
    }

    private var date: Date {
        switch request.when {
        case .now: AppClock.now
        case .departAt(let d), .arriveBy(let d): d
        }
    }

    private var modeBinding: Binding<Mode> {
        Binding(get: { mode }, set: { set($0, date) })
    }

    private var dateBinding: Binding<Date> {
        Binding(get: { date }, set: { set(mode, $0) })
    }

    private func set(_ mode: Mode, _ date: Date) {
        guard var r = app.tripRequest else { return }
        switch mode {
        case .now: r.when = .now
        case .depart: r.when = .departAt(date)
        case .arrive: r.when = .arriveBy(date)
        }
        app.tripRequest = r
    }
}

struct ItineraryRow: View {
    let itinerary: Itinerary

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 10) {
                if itinerary.transitLegs.isEmpty {
                    Label("Walk", systemImage: "figure.walk").font(.system(size: 15, weight: .bold, design: .rounded))
                } else {
                    LegChips(legs: itinerary.legs)
                }
                Spacer(minLength: 8)
                DurationText(seconds: itinerary.duration)
            }
            HStack {
                Text("\(Fmt.clock(itinerary.startTime)) – \(Fmt.clock(itinerary.endTime))")
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                Spacer()
                TimelineView(.periodic(from: .now, by: 15)) { context in
                    LeaveIn(date: itinerary.startTime, now: AppClock.shift(context.date))
                }
            }
            if let first = itinerary.transitLegs.first {
                let boarding = Bogota.boarding(name: first.from.name, code: first.from.stopCode)
                HStack(spacing: 5) {
                    Image(systemName: "arrow.turn.down.right").font(.caption2.weight(.bold))
                    Text("\(Bogota.stationName(first.from.name))\(boarding.map { " · \($0.text)" } ?? "")")
                        .lineLimit(1)
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

struct DurationText: View {
    let seconds: Int

    var body: some View {
        let minutes = Int((Double(seconds) / 60).rounded())
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            if minutes < 60 {
                Text("\(minutes)").font(Theme.number(24))
                Text("min").font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(.secondary)
            } else {
                Text("\(minutes / 60):\(String(format: "%02d", minutes % 60))").font(Theme.number(24))
                Text("h").font(.system(size: 12, weight: .bold, design: .rounded)).foregroundStyle(.secondary)
            }
        }
    }
}

struct LeaveIn: View {
    let date: Date
    let now: Date

    var body: some View {
        let m = Int(date.timeIntervalSince(now) / 60)
        Group {
            if m <= 0 {
                Text("Leave now").foregroundStyle(Theme.accent)
            } else if m > 90 {
                Text("Leave at \(Fmt.clock(date))").foregroundStyle(.secondary)
            } else {
                Text("Leave in \(m) min").foregroundStyle(Theme.go)
            }
        }
        .font(.system(size: 13, weight: .bold, design: .rounded))
    }
}
