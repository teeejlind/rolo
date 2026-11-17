import SwiftUI

@main
struct RoloApp: App {
    @State private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(app)
                .tint(Theme.accent)
        }
    }
}
