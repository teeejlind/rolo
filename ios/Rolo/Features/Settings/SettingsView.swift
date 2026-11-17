import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var customURL = ""
    @State private var status: String?
    @State private var testing = false

    var body: some View {
        Form {
            Section {
                serverRow(.local)
                serverRow(.transitous)
                HStack {
                    TextField("http://192.168.1.20:8080", text: $customURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Use") {
                        let trimmed = customURL.trimmingCharacters(in: .whitespaces)
                        guard URL(string: trimmed) != nil, !trimmed.isEmpty else { return }
                        app.setServer(ServerConfig(name: "Custom", urlString: trimmed))
                    }
                    .disabled(customURL.isEmpty)
                }
                Button {
                    Task { await test() }
                } label: {
                    HStack {
                        Text("Test connection")
                        Spacer()
                        if testing { ProgressView() } else if let status { Text(status).foregroundStyle(.secondary) }
                    }
                }
            } header: {
                Text("Trip planner")
            } footer: {
                Text("The Rolo router runs on your Mac with TransMilenio's current schedule, trunk routes included. On an iPhone, point this at your Mac's Wi-Fi address. Transitous is public and always on, but its Bogotá data has no trunk routes.")
            }

            Section {
                Picker("Pretend I'm at", selection: Binding(get: { app.demoSpot }, set: { app.setDemoSpot($0) })) {
                    ForEach(DemoSpot.allCases) { Text($0.name).tag($0) }
                }
            } header: {
                Text("When you're outside Bogotá")
            } footer: {
                Text(app.inBogota ? "You're in Bogotá, so Rolo is using your real location." : "Rolo uses this spot until your phone is in Bogotá.")
            }

            Section("Data") {
                Text("Schedules: TRANSMILENIO S.A. open data (GTFS, CC BY-SA 4.0). Map stations and corridors: TRANSMILENIO S.A. ArcGIS. Streets and search: © OpenStreetMap contributors. Routing: MOTIS.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text("Times are scheduled, not live. TransMilenio doesn't publish real-time data.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if app.server.name == "Custom" { customURL = app.server.urlString } }
    }

    private func serverRow(_ config: ServerConfig) -> some View {
        Button {
            app.setServer(config)
            status = nil
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(config.name).foregroundStyle(.primary)
                    Text(config.urlString).font(.caption.monospaced()).foregroundStyle(.secondary)
                }
                Spacer()
                if app.server.urlString == config.urlString {
                    Image(systemName: "checkmark").font(.body.weight(.bold)).foregroundStyle(Theme.accent)
                }
            }
        }
    }

    private func test() async {
        testing = true
        defer { testing = false }
        status = await app.client.ping() ? "Connected" : "No answer"
    }
}
