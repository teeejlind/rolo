import CoreLocation

/// Google encoded-polyline decoding. MOTIS encodes leg geometry at precision 6.
nonisolated enum Polyline {
    static func decode(_ encoded: String, precision: Int = 6) -> [CLLocationCoordinate2D] {
        let bytes = Array(encoded.utf8)
        let factor = pow(10.0, Double(precision))
        var coords: [CLLocationCoordinate2D] = []
        coords.reserveCapacity(bytes.count / 4)
        var index = 0
        var lat = 0
        var lon = 0

        func nextValue() -> Int? {
            var result = 0
            var shift = 0
            while index < bytes.count {
                let b = Int(bytes[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20 {
                    return (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
                }
            }
            return nil
        }

        while index < bytes.count {
            guard let dLat = nextValue(), let dLon = nextValue() else { break }
            lat += dLat
            lon += dLon
            coords.append(CLLocationCoordinate2D(latitude: Double(lat) / factor, longitude: Double(lon) / factor))
        }
        return coords
    }
}
