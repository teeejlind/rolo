// Renders the 1024px app icon: bold rounded "R" on a TransMilenio-red gradient, with a
// yellow stop dot. Run: swift tools/make_icon.swift ios/Rolo/Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-1024.png"
let px = 1024

func rgb(_ hex: UInt32) -> CGColor {
    CGColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                          colors: [rgb(0xFF5A4E), rgb(0xE8384F), rgb(0xA3122F)] as CFArray,
                          locations: [0, 0.45, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: CGFloat(px)), end: CGPoint(x: CGFloat(px), y: 0), options: [])

// Faint corridor stripes, like trunk lines crossing the city.
ctx.setLineCap(.round)
ctx.setLineWidth(46)
ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.09))
for offset in [-260.0, 40.0, 340.0] {
    ctx.move(to: CGPoint(x: -100, y: 300 + offset))
    ctx.addLine(to: CGPoint(x: 1124, y: 760 + offset))
    ctx.strokePath()
}

let base = NSFont.systemFont(ofSize: 700, weight: .black)
let font = NSFont(descriptor: base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor, size: 700) ?? base
let text = NSAttributedString(string: "R", attributes: [.font: font, .foregroundColor: NSColor.white])
let bounds = text.boundingRect(with: NSSize(width: 2000, height: 2000), options: [.usesLineFragmentOrigin])
let glyph = CTLineGetBoundsWithOptions(CTLineCreateWithAttributedString(text), .useGlyphPathBounds)
let origin = CGPoint(x: (CGFloat(px) - glyph.width) / 2 - glyph.minX - 40,
                     y: (CGFloat(px) - glyph.height) / 2 - glyph.minY)
text.draw(at: origin)
_ = bounds

// Stop dot: yellow with a white ring, sitting at the R's leg.
let dot = CGRect(x: 690, y: 170, width: 190, height: 190)
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
ctx.fillEllipse(in: dot)
ctx.setFillColor(rgb(0xFFD23F))
ctx.fillEllipse(in: dot.insetBy(dx: 30, dy: 30))

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
