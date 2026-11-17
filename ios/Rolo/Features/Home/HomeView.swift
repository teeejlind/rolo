import MapKit
import SwiftUI

/// One map for the whole app, with a sheet on top whose navigation stack drives what the map shows.
struct HomeView: View {
    @Environment(AppModel.self) private var app
    @State private var camera: MapCameraPosition = .region(
        MKCoordinateRegion(center: DemoSpot.chapinero.coordinate, latitudinalMeters: 2200, longitudinalMeters: 2200))

    var body: some View {
        @Bindable var app = app
        MapCanvas(camera: $camera)
            .ignoresSafeArea()
            .sheet(isPresented: .constant(true)) {
                SheetRoot()
                    .environment(app)
                    .presentationDetents([SheetDetent.peek, SheetDetent.mid, SheetDetent.full], selection: $app.detent)
                    .presentationBackgroundInteraction(.enabled(upThrough: SheetDetent.mid))
                    .presentationDragIndicator(.visible)
                    .interactiveDismissDisabled()
            }
            .onAppear { app.location.start() }
            .onChange(of: app.mapFocus, initial: true) { _, focus in
                withAnimation(.smooth(duration: 0.6)) { camera = CameraFit.position(for: focus, here: app.here) }
            }
            .onChange(of: app.inBogota) { _, _ in
                guard app.mapFocus == .nearby else { return }
                withAnimation(.smooth(duration: 0.6)) { camera = CameraFit.position(for: .nearby, here: app.here) }
            }
            .onChange(of: app.demoSpot) { _, _ in
                guard app.mapFocus == .nearby else { return }
                withAnimation(.smooth(duration: 0.6)) { camera = CameraFit.position(for: .nearby, here: app.here) }
            }
    }
}

struct SheetRoot: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        NavigationStack(path: $app.path) {
            NearbyHome()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .search(let purpose): SearchView(purpose: purpose)
                    case .plan: TripPlannerView()
                    case .itinerary(let itinerary): ItineraryDetailView(itinerary: itinerary)
                    case .trip(let ref): TripView(ref: ref)
                    case .settings: SettingsView()
                    }
                }
        }
    }
}
