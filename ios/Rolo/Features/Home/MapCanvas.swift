import MapKit
import SwiftUI

struct MapCanvas: View {
    @Environment(AppModel.self) private var app
    @Binding var camera: MapCameraPosition

    var body: some View {
        Map(position: $camera) {
            UserAnnotation()

            // The BRT network, always there like a metro map; faded when a trip is on screen.
            ForEach(app.network.corridors) { corridor in
                MapPolyline(coordinates: corridor.coordinates)
                    .stroke(Theme.zoneColor(corridor.letter, in: app.network).opacity(isNearby ? 0.85 : 0.22),
                            style: StrokeStyle(lineWidth: isNearby ? 5 : 4, lineCap: .round, lineJoin: .round))
            }

            if isNearby {
                ForEach(app.network.stations) { station in
                    Annotation(station.name, coordinate: station.coordinate, anchor: .center) {
                        StationGlyph(color: Theme.zoneColor(station.letter, in: app.network), isTrunk: true, size: 13)
                    }
                    .annotationTitles(.hidden)
                }
                ForEach(zonalStops) { stop in
                    Annotation(stop.name, coordinate: stop.coordinate, anchor: .center) {
                        StationGlyph(color: Color(hex: "1D63B8"), isTrunk: false, size: 12)
                    }
                    .annotationTitles(.hidden)
                }
            }

            ForEach(lines) { line in
                if line.isWalk {
                    MapPolyline(coordinates: line.coordinates)
                        .stroke(Theme.walk, style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [0.5, 8]))
                } else {
                    MapPolyline(coordinates: line.coordinates)
                        .stroke(.white, style: StrokeStyle(lineWidth: 9, lineCap: .round, lineJoin: .round))
                    MapPolyline(coordinates: line.coordinates)
                        .stroke(line.color, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
                }
            }

            ForEach(pins) { pin in
                Annotation(pin.title, coordinate: pin.coordinate, anchor: .center) {
                    PinView(pin: pin)
                }
                .annotationTitles(pin.kind == .stop ? .hidden : .automatic)
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll, showsTraffic: false))
        .mapControls {
            MapUserLocationButton()
            MapCompass()
        }
    }

    private var isNearby: Bool { app.mapFocus == .nearby }

    private var zonalStops: [NearbyStation] {
        app.nearbyStations.filter { !$0.isTrunk }
    }

    private var lines: [MapLine] {
        switch app.mapFocus {
        case .nearby:
            return []
        case .itinerary(let it):
            return it.legs.map { MapLine(id: $0.id, coordinates: $0.coordinates, color: $0.isWalk ? Theme.walk : $0.badgeColor, isWalk: $0.isWalk) }
        case .trip(let leg, _):
            return [MapLine(id: leg.id, coordinates: leg.coordinates, color: leg.badgeColor, isWalk: false)]
        }
    }

    private var pins: [MapPin] {
        switch app.mapFocus {
        case .nearby:
            return []
        case .itinerary(let it):
            var pins: [MapPin] = []
            if let first = it.legs.first {
                pins.append(MapPin(id: "origin", title: "", coordinate: first.from.coordinate, color: Theme.origin, kind: .origin))
            }
            for leg in it.legs where leg.isTransit {
                pins.append(MapPin(id: "b-\(leg.id)", title: Bogota.stationName(leg.from.name), coordinate: leg.from.coordinate, color: leg.badgeColor, kind: .transfer))
                pins.append(MapPin(id: "a-\(leg.id)", title: Bogota.stationName(leg.to.name), coordinate: leg.to.coordinate, color: leg.badgeColor, kind: .transfer))
            }
            if let last = it.legs.last {
                pins.append(MapPin(id: "dest", title: "", coordinate: last.to.coordinate, color: Theme.destination, kind: .destination))
            }
            return pins
        case .trip(let leg, let boarding):
            return leg.allStops.enumerated().map { i, stop in
                let isBoarding = stop.stopId == boarding
                return MapPin(id: "s\(i)-\(stop.stopId ?? stop.name)", title: Bogota.stationName(stop.name),
                              coordinate: stop.coordinate, color: leg.badgeColor, kind: isBoarding ? .boarding : .stop)
            }
        }
    }
}

struct MapLine: Identifiable {
    let id: String
    let coordinates: [CLLocationCoordinate2D]
    let color: Color
    let isWalk: Bool
}

struct MapPin: Identifiable {
    enum Kind { case origin, destination, transfer, stop, boarding }
    let id: String
    let title: String
    let coordinate: CLLocationCoordinate2D
    let color: Color
    let kind: Kind
}

private struct PinView: View {
    let pin: MapPin

    var body: some View {
        switch pin.kind {
        case .origin, .destination:
            Circle()
                .fill(pin.color)
                .overlay(Circle().stroke(.white, lineWidth: 3))
                .frame(width: 18, height: 18)
                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
        case .transfer, .boarding:
            Circle()
                .fill(.white)
                .overlay(Circle().stroke(pin.color, lineWidth: 4))
                .frame(width: pin.kind == .boarding ? 18 : 14, height: pin.kind == .boarding ? 18 : 14)
                .shadow(color: .black.opacity(0.25), radius: 1.5, y: 1)
        case .stop:
            Circle()
                .fill(.white)
                .overlay(Circle().stroke(pin.color, lineWidth: 2.5))
                .frame(width: 9, height: 9)
        }
    }
}

/// Camera framing that keeps content in the part of the map the sheet doesn't cover.
enum CameraFit {
    static func position(for focus: MapFocus, here: CLLocationCoordinate2D) -> MapCameraPosition {
        switch focus {
        case .nearby:
            let span = 0.014
            let center = CLLocationCoordinate2D(latitude: here.latitude - span * 0.3, longitude: here.longitude)
            return .region(MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)))
        case .itinerary(let it):
            return fitting(it.legs.flatMap(\.coordinates))
        case .trip(let leg, _):
            return fitting(leg.coordinates)
        }
    }

    static func fitting(_ coords: [CLLocationCoordinate2D]) -> MapCameraPosition {
        let points = coords.map(MKMapPoint.init)
        guard let first = points.first else { return .automatic }
        var minX = first.x, maxX = first.x, minY = first.y, maxY = first.y
        for p in points {
            minX = min(minX, p.x); maxX = max(maxX, p.x)
            minY = min(minY, p.y); maxY = max(maxY, p.y)
        }
        let floor = MKMapPointsPerMeterAtLatitude(coords[0].latitude) * 400
        let width = max(maxX - minX, floor), height = max(maxY - minY, floor)
        let padX = width * 0.18, padTop = height * 0.25
        // Double the height downward: the sheet covers roughly the lower half of the screen.
        let rect = MKMapRect(x: minX - padX, y: minY - padTop, width: width + padX * 2, height: (height + padTop) * 2.1)
        return .rect(rect)
    }
}
