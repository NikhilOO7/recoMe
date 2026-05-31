//
//  ShareViewController.swift
//  RecomeShareExtension
//
//  iOS Share Sheet entry point. See ../README.md for the host-app contract.
//
//  This view controller does three things, in order:
//    1. Pull the first text/URL attachment off the share's NSExtensionContext.
//    2. Stash the payload in the App Group's UserDefaults so the host app
//       can read the full title (URL-scheme query params get truncated).
//    3. Open `recome://share?url=...&title=...` so the host app foregrounds
//       and ShareReceiver runs the actual /intelligence/signals POST.
//
//  We deliberately do NOT do the network call from inside the extension.
//  Extensions have stricter memory limits, no shared auth context with the
//  host app by default, and a much worse debugging story. Forwarding to the
//  host app keeps one ingest path — see README §"What this scaffold does NOT
//  do" for the deferred work.
//

import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

private let APP_GROUP = "group.app.recome.shared"
private let PAYLOAD_KEY = "shared-payload"
private let HOST_SCHEME = "recome"

class ShareViewController: SLComposeServiceViewController {

    override func isContentValid() -> Bool {
        // Accept any non-empty share so the post button is enabled — the host
        // app does the real validation against /intelligence/signals.
        return true
    }

    override func didSelectPost() {
        extractURLAndTitle { [weak self] url, title in
            guard let self else { return }

            if let url = url {
                self.persistToAppGroup(url: url, title: title)
                self.openHostApp(url: url, title: title)
            }

            // Tell the share sheet we're done — it animates away whether or
            // not we actually opened the host app.
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    override func configurationItems() -> [Any]! {
        // No category picker in v1 (see README §"What this scaffold does NOT do").
        return []
    }

    // ── Extraction ────────────────────────────────────────────────────────

    /// Walks the NSExtensionItem attachments looking for a URL or text. iOS
    /// gives us heterogeneous shapes depending on the source app:
    ///   - Safari        → public.url + an attributed title
    ///   - Mail          → public.url (sometimes nested in plain text)
    ///   - Reddit / X    → public.text (URL embedded in body)
    /// We try URL first, then text, and regex a URL out of the text if needed.
    private func extractURLAndTitle(_ done: @escaping (URL?, String?) -> Void) {
        let title = self.contentText ?? ""
        guard
            let items = extensionContext?.inputItems as? [NSExtensionItem],
            let attachments = items.first?.attachments
        else {
            done(nil, title.isEmpty ? nil : title)
            return
        }

        let urlType = UTType.url.identifier
        let textType = UTType.plainText.identifier

        let attachment = attachments.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) })
            ?? attachments.first(where: { $0.hasItemConformingToTypeIdentifier(textType) })
        guard let provider = attachment else {
            done(nil, title.isEmpty ? nil : title)
            return
        }

        if provider.hasItemConformingToTypeIdentifier(urlType) {
            provider.loadItem(forTypeIdentifier: urlType, options: nil) { coding, _ in
                let url = coding as? URL ?? (coding as? String).flatMap(URL.init(string:))
                DispatchQueue.main.async { done(url, title.isEmpty ? nil : title) }
            }
            return
        }

        if provider.hasItemConformingToTypeIdentifier(textType) {
            provider.loadItem(forTypeIdentifier: textType, options: nil) { coding, _ in
                let text = (coding as? String) ?? ""
                let url = Self.firstURL(in: text)
                let derivedTitle = title.isEmpty ? Self.titleWithoutURL(text, url: url) : title
                DispatchQueue.main.async { done(url, derivedTitle) }
            }
            return
        }

        done(nil, title.isEmpty ? nil : title)
    }

    // ── Persistence + handoff ─────────────────────────────────────────────

    /// Writes the payload to the shared App Group so the host app can read
    /// the full title even when the URL scheme truncates it.
    private func persistToAppGroup(url: URL, title: String?) {
        guard let defaults = UserDefaults(suiteName: APP_GROUP) else { return }
        let payload: [String: Any] = [
            "url": url.absoluteString,
            "title": title ?? "",
            "ts": Int(Date().timeIntervalSince1970 * 1000)
        ]
        defaults.set(payload, forKey: PAYLOAD_KEY)
    }

    /// Opens `recome://share?url=...&title=...` via UIApplication. We use the
    /// canonical responder-chain walk because extensions can't access
    /// UIApplication.shared directly — `openURL:` exists via the responder
    /// chain back to the host process.
    private func openHostApp(url: URL, title: String?) {
        var components = URLComponents()
        components.scheme = HOST_SCHEME
        components.host = "share"
        var items: [URLQueryItem] = [URLQueryItem(name: "url", value: url.absoluteString)]
        if let title = title, !title.isEmpty {
            items.append(URLQueryItem(name: "title", value: title))
        }
        components.queryItems = items
        guard let deeplink = components.url else { return }

        var responder: UIResponder? = self
        let selector = sel_registerName("openURL:")
        while let r = responder {
            if r.responds(to: selector) {
                _ = r.perform(selector, with: deeplink)
                return
            }
            responder = r.next
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static let urlRegex: NSRegularExpression = {
        // Greedy-enough; the host-app side runs the canonical regex.
        return try! NSRegularExpression(pattern: "https?://[^\\s<>\"']+", options: [.caseInsensitive])
    }()

    private static func firstURL(in text: String) -> URL? {
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = urlRegex.firstMatch(in: text, range: range),
              let r = Range(match.range, in: text) else { return nil }
        return URL(string: String(text[r]))
    }

    private static func titleWithoutURL(_ text: String, url: URL?) -> String? {
        guard let url = url else { return text.isEmpty ? nil : text }
        let stripped = text.replacingOccurrences(of: url.absoluteString, with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return stripped.isEmpty ? nil : stripped
    }
}
