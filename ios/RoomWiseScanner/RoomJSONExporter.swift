import Foundation
import RoomPlan
import simd

enum RoomJSONExporter {
    static func exportCapturedRoom(_ capturedRoom: CapturedRoom) throws -> URL {
        let payload = makePayload(from: capturedRoom)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(payload)

        let suffix = UUID().uuidString.prefix(8)
        let filename = "roomwise-scan-\(dateStampFormatter.string(from: Date()))-\(suffix).json"
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }

    private static let dateStampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static func makePayload(from capturedRoom: CapturedRoom) -> ExportPayload {
        let wallSegments = capturedRoom.walls.map(makeWallSegment(from:))
        var polygon = makePolygon(from: wallSegments)

        if polygon.count < 3 {
            polygon = fallbackPolygon(from: wallSegments)
        }

        let shift = shiftToPositiveSpace(points: polygon)
        polygon = polygon.map { point in
            Point2D(x: point.x + shift.x, y: point.y + shift.y)
        }

        let wallEdges = makeWallEdges(from: polygon)
        let doors = makeDoors(from: capturedRoom.doors, edges: wallEdges, shift: shift)
        let windows = makeWindows(from: capturedRoom.windows, edges: wallEdges, shift: shift)
        let furniture = makeFurniture(from: capturedRoom.objects, shift: shift)

        return ExportPayload(
            meta: ExportMeta(
                source: "roomplan-ios",
                version: "0.1",
                createdAt: dateStampFormatter.string(from: Date()),
                roomName: "Scanned Room"
            ),
            room: ExportRoom(
                unit: "m",
                polygon: polygon.map { ExportPoint(x: roundValue($0.x), y: roundValue($0.y)) },
                doors: doors,
                windows: windows
            ),
            furniture: furniture
        )
    }

    private static func makeWallSegment(from wall: CapturedRoom.Surface) -> WallSegment {
        let center = xyPoint(from: wall.transform)
        let yaw = yawRadians(from: wall.transform)
        let length = max(Double(wall.dimensions.x), 0.1)
        let half = length * 0.5
        let dx = cos(yaw) * half
        let dy = sin(yaw) * half

        return WallSegment(
            start: Point2D(x: center.x - dx, y: center.y - dy),
            end: Point2D(x: center.x + dx, y: center.y + dy),
            center: center
        )
    }

    private static func makePolygon(from walls: [WallSegment]) -> [Point2D] {
        guard walls.count >= 3 else {
            return []
        }

        let centroid = Point2D(
            x: walls.map(\.center.x).reduce(0, +) / Double(walls.count),
            y: walls.map(\.center.y).reduce(0, +) / Double(walls.count)
        )

        let orderedWalls = walls.sorted { lhs, rhs in
            let lhsAngle = atan2(lhs.center.y - centroid.y, lhs.center.x - centroid.x)
            let rhsAngle = atan2(rhs.center.y - centroid.y, rhs.center.x - centroid.x)
            return lhsAngle < rhsAngle
        }

        var corners: [Point2D] = []
        for index in orderedWalls.indices {
            let current = orderedWalls[index]
            let next = orderedWalls[(index + 1) % orderedWalls.count]

            if let intersection = intersectionPoint(
                line1Start: current.start,
                line1End: current.end,
                line2Start: next.start,
                line2End: next.end
            ) {
                corners.append(intersection)
            } else {
                let nearest = nearestEndpoints(current, next)
                corners.append(
                    Point2D(
                        x: (nearest.0.x + nearest.1.x) * 0.5,
                        y: (nearest.0.y + nearest.1.y) * 0.5
                    )
                )
            }
        }

        return deduplicate(points: corners)
    }

    private static func fallbackPolygon(from walls: [WallSegment]) -> [Point2D] {
        let allPoints = walls.flatMap { [$0.start, $0.end] }
        guard !allPoints.isEmpty else {
            return [
                Point2D(x: 0, y: 0),
                Point2D(x: 4, y: 0),
                Point2D(x: 4, y: 3),
                Point2D(x: 0, y: 3)
            ]
        }

        let minX = allPoints.map(\.x).min() ?? 0
        let maxX = allPoints.map(\.x).max() ?? 4
        let minY = allPoints.map(\.y).min() ?? 0
        let maxY = allPoints.map(\.y).max() ?? 3
        if abs(maxX - minX) < 0.01 || abs(maxY - minY) < 0.01 {
            return [
                Point2D(x: 0, y: 0),
                Point2D(x: 4, y: 0),
                Point2D(x: 4, y: 3),
                Point2D(x: 0, y: 3)
            ]
        }

        return [
            Point2D(x: minX, y: minY),
            Point2D(x: maxX, y: minY),
            Point2D(x: maxX, y: maxY),
            Point2D(x: minX, y: maxY)
        ]
    }

    private static func deduplicate(points: [Point2D]) -> [Point2D] {
        guard !points.isEmpty else {
            return []
        }

        var result: [Point2D] = []
        for point in points {
            if let last = result.last, distance(from: point, to: last) < 0.05 {
                continue
            }
            result.append(point)
        }
        if let first = result.first, let last = result.last, distance(from: first, to: last) < 0.05 {
            _ = result.popLast()
        }
        return result
    }

    private static func makeWallEdges(from polygon: [Point2D]) -> [WallEdge] {
        guard polygon.count >= 2 else {
            return []
        }

        return polygon.indices.map { index in
            let start = polygon[index]
            let end = polygon[(index + 1) % polygon.count]
            return WallEdge(wallIndex: index, start: start, end: end)
        }
    }

    private static func makeDoors(from doors: [CapturedRoom.Surface], edges: [WallEdge], shift: Point2D) -> [DoorEntry] {
        doors.enumerated().map { index, door in
            let center = shifted(point: xyPoint(from: door.transform), by: shift)
            let width = max(Double(door.dimensions.x), 0.6)
            let match = nearestEdge(to: center, edges: edges)
            let wallLength = match?.edge.length ?? 0
            let offset = max(0, min((match?.offsetAlongWall ?? 0) - width * 0.5, max(0, wallLength - width)))

            return DoorEntry(
                id: "door-\(index + 1)",
                wallIndex: match?.edge.wallIndex ?? 0,
                offset: roundValue(offset),
                width: roundValue(width),
                swing: "inward-left"
            )
        }
    }

    private static func makeWindows(from windows: [CapturedRoom.Surface], edges: [WallEdge], shift: Point2D) -> [WindowEntry] {
        windows.enumerated().map { index, window in
            let center = shifted(point: xyPoint(from: window.transform), by: shift)
            let width = max(Double(window.dimensions.x), 0.4)
            let match = nearestEdge(to: center, edges: edges)
            let wallLength = match?.edge.length ?? 0
            let offset = max(0, min((match?.offsetAlongWall ?? 0) - width * 0.5, max(0, wallLength - width)))

            return WindowEntry(
                id: "window-\(index + 1)",
                wallIndex: match?.edge.wallIndex ?? 0,
                offset: roundValue(offset),
                width: roundValue(width)
            )
        }
    }

    private static func makeFurniture(from objects: [CapturedRoom.Object], shift: Point2D) -> [FurnitureEntry] {
        objects.enumerated().map { index, object in
            let category = rawCategory(from: object.category)
            let position = shifted(point: xyPoint(from: object.transform), by: shift)
            let rotation = Int(round(normalizedDegrees(from: object.transform)))

            return FurnitureEntry(
                id: "object-\(index + 1)",
                name: displayName(for: category),
                type: furnitureType(from: category),
                category: category,
                width: roundValue(max(Double(object.dimensions.x), 0.1)),
                depth: roundValue(max(Double(object.dimensions.z), 0.1)),
                height: roundValue(max(Double(object.dimensions.y), 0.1)),
                x: roundValue(position.x),
                y: roundValue(position.y),
                rotation: rotation,
                existing: true,
                movable: true
            )
        }
    }

    private static func rawCategory(from category: CapturedRoom.Object.Category) -> String {
        String(describing: category)
            .replacingOccurrences(of: "Category.", with: "")
            .lowercased()
    }

    private static func furnitureType(from category: String) -> String {
        if category.contains("sofa") {
            return "sofa"
        }
        if category.contains("television") || category == "tv" {
            return "tv"
        }
        if category.contains("desk") {
            return "desk"
        }
        if category.contains("bed") {
            return "bed"
        }
        if category.contains("chair") || category.contains("stool") {
            return "chair"
        }
        if category.contains("table") {
            return "table"
        }
        if category.contains("storage") || category.contains("cabinet") || category.contains("shelf") {
            return "storage"
        }
        return "furniture"
    }

    private static func displayName(for category: String) -> String {
        let words = category
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
        if words.isEmpty {
            return "Furniture"
        }
        return words.map { $0.capitalized }.joined(separator: " ")
    }

    private static func shiftToPositiveSpace(points: [Point2D]) -> Point2D {
        let minX = points.map(\.x).min() ?? 0
        let minY = points.map(\.y).min() ?? 0
        return Point2D(x: -minX, y: -minY)
    }

    private static func shifted(point: Point2D, by delta: Point2D) -> Point2D {
        Point2D(x: point.x + delta.x, y: point.y + delta.y)
    }

    private static func xyPoint(from transform: simd_float4x4) -> Point2D {
        Point2D(
            x: Double(transform.columns.3.x),
            y: Double(transform.columns.3.z)
        )
    }

    private static func yawRadians(from transform: simd_float4x4) -> Double {
        atan2(Double(transform.columns.0.z), Double(transform.columns.0.x))
    }

    private static func normalizedDegrees(from transform: simd_float4x4) -> Double {
        let degrees = yawRadians(from: transform) * 180 / .pi
        let normalized = degrees.truncatingRemainder(dividingBy: 360)
        return normalized >= 0 ? normalized : (normalized + 360)
    }

    private static func nearestEdge(to point: Point2D, edges: [WallEdge]) -> EdgeMatch? {
        var bestMatch: EdgeMatch?
        for edge in edges {
            let projection = projectedDistance(from: point, to: edge)
            if let current = bestMatch, current.distance <= projection.distance {
                continue
            }
            bestMatch = EdgeMatch(edge: edge, offsetAlongWall: projection.offsetAlongWall, distance: projection.distance)
        }
        return bestMatch
    }

    private static func projectedDistance(from point: Point2D, to edge: WallEdge) -> (offsetAlongWall: Double, distance: Double) {
        let vx = edge.end.x - edge.start.x
        let vy = edge.end.y - edge.start.y
        let lengthSquared = max(vx * vx + vy * vy, 0.000001)
        let wx = point.x - edge.start.x
        let wy = point.y - edge.start.y
        let ratio = max(0, min(1, (wx * vx + wy * vy) / lengthSquared))
        let projection = Point2D(
            x: edge.start.x + vx * ratio,
            y: edge.start.y + vy * ratio
        )
        return (
            offsetAlongWall: ratio * edge.length,
            distance: distance(from: point, to: projection)
        )
    }

    private static func nearestEndpoints(_ lhs: WallSegment, _ rhs: WallSegment) -> (Point2D, Point2D) {
        let candidates = [
            (lhs.start, rhs.start),
            (lhs.start, rhs.end),
            (lhs.end, rhs.start),
            (lhs.end, rhs.end)
        ]
        return candidates.min { distance(from: $0.0, to: $0.1) < distance(from: $1.0, to: $1.1) } ?? (lhs.end, rhs.start)
    }

    private static func intersectionPoint(
        line1Start: Point2D,
        line1End: Point2D,
        line2Start: Point2D,
        line2End: Point2D
    ) -> Point2D? {
        let x1 = line1Start.x
        let y1 = line1Start.y
        let x2 = line1End.x
        let y2 = line1End.y
        let x3 = line2Start.x
        let y3 = line2Start.y
        let x4 = line2End.x
        let y4 = line2End.y

        let denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        guard abs(denominator) > 0.000001 else {
            return nil
        }

        let determinant1 = x1 * y2 - y1 * x2
        let determinant2 = x3 * y4 - y3 * x4

        let px = (determinant1 * (x3 - x4) - (x1 - x2) * determinant2) / denominator
        let py = (determinant1 * (y3 - y4) - (y1 - y2) * determinant2) / denominator
        return Point2D(x: px, y: py)
    }

    private static func distance(from a: Point2D, to b: Point2D) -> Double {
        hypot(a.x - b.x, a.y - b.y)
    }

    private static func roundValue(_ value: Double) -> Double {
        let rounded = (value * 1000).rounded() / 1000
        if abs(rounded) < 0.0001 {
            return 0
        }
        return rounded
    }
}

private struct ExportPayload: Codable {
    let meta: ExportMeta
    let room: ExportRoom
    let furniture: [FurnitureEntry]
}

private struct ExportMeta: Codable {
    let source: String
    let version: String
    let createdAt: String
    let roomName: String
}

private struct ExportRoom: Codable {
    let unit: String
    let polygon: [ExportPoint]
    let doors: [DoorEntry]
    let windows: [WindowEntry]
}

private struct ExportPoint: Codable {
    let x: Double
    let y: Double
}

private struct DoorEntry: Codable {
    let id: String
    let wallIndex: Int
    let offset: Double
    let width: Double
    let swing: String
}

private struct WindowEntry: Codable {
    let id: String
    let wallIndex: Int
    let offset: Double
    let width: Double
}

private struct FurnitureEntry: Codable {
    let id: String
    let name: String
    let type: String
    let category: String
    let width: Double
    let depth: Double
    let height: Double
    let x: Double
    let y: Double
    let rotation: Int
    let existing: Bool
    let movable: Bool
}

private struct Point2D {
    let x: Double
    let y: Double
}

private struct WallSegment {
    let start: Point2D
    let end: Point2D
    let center: Point2D
}

private struct WallEdge {
    let wallIndex: Int
    let start: Point2D
    let end: Point2D

    var length: Double {
        hypot(end.x - start.x, end.y - start.y)
    }
}

private struct EdgeMatch {
    let edge: WallEdge
    let offsetAlongWall: Double
    let distance: Double
}
