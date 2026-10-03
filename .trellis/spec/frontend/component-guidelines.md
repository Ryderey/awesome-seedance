# Component guidelines

Use app.js node()/button() helpers and textContent/replaceChildren for library and model text. Never interpolate those values with innerHTML. Card headings use actual local titles. Poster images load lazily; video loads only inside the detail dialog. Source media is the default and retests are explicitly labelled. Close pauses and removes the video src. Error/absent media shows available literal URLs and record-derived link buttons.

Native dialogs provide Escape/focus behavior. CSS uses warm light/charcoal/teal, flat surfaces and reduced-motion handling. Cases appear in increments of 12; the main process must return every locally matched card for browsing, not a permanently truncated first page. Full original prompt and template copyPrompt are different copy actions.
