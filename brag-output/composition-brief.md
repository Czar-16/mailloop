# Hyperframes Composition Brief: Mailloop

Create a polished 20-second, 1920×1080 launch video. Output composition/ and brag.mp4, brag.jpg, share-copy.txt in this directory. Follow brag-plan.md as the creative contract.

Source material: src/app/page.tsx, src/components/compose.tsx, src/components/landing/landing.css, DESIGN.md. Preserve the violet/pink brand, dark surfaces, source UI labels and one-email-per-person behavior. Recreate the working Compose and History views using fictional demonstration data, not live account data. No external publishing or actual sending.

Four beats: hook 0–3s; recipient selection and personal preview 3–10s; simulated delivery/reply tracking 10–16s; brand close 16–20s. Keep copy sparse and large. Working-app screen is the centerpiece. Use “Pick up to 15 contacts”, “Personal preview”, “Attach Resume”, “Send queue”, “Send, then follow”, and “Personalized outreach, made easy.” from the project. Do not introduce metrics, guarantees, or ungrounded features. Keep a small “Demo · time compressed” label for simulated sending/results.

Palette: background #0b0a14; cards #14122a; text #f2f0fa; secondary #a8a3c2; accent #a78bfa; violet #8b5cf6; pink #e879f9; success #34d399. Display Bricolage Grotesque and body DM Sans if fonts can be made local; consistent sans fallback otherwise. Spacious composition with fine rules, subtle surfaces, and smooth movement; no abstract filler.

Audio: bundled vol-12 steady music at 0.30, fade in/out. Cue preset ../skill assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json (resolve to the installed skill directory). Optional reveal locks 13.11 and 17.47s. Two quiet low-risk motion-matched SFX selected using the installed skill's assets/sfx/sfx-analysis.md. Kokoro af_heart narration is now explicitly requested. See voiceover-script.txt. Duck the music under narration using a volume automation lane. Copy only chosen assets into composition/assets. Extract audio-reactive data via the Hyperframes creative guidance if available, otherwise document the reason for skipping.

Use current Hyperframes core, animation, creative, keyframes and CLI skills. Keep animation seek-safe. Use local runtime dependencies and assets. Check must pass all lint, runtime, layout and contrast gates before rendering. Render locally in high quality. Review settled frames; choose the strongest for brag.jpg and bake it as frame zero. User already requested the launch video; render as part of this invocation.
