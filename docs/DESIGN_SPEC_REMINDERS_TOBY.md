# Design Spec — Reminders × Toby

## Product direction
- Information architecture follows Toby: left workspace rail, center collections board, right active tabs rail.
- Visual language follows Apple Reminders style: clean surfaces, low-noise hierarchy, subtle accent.

## Layout
- Left rail: 280px (collapsed 56px)
- Center board: fluid
- Right rail: 340px (collapsed 56px)
- Top bar: global search + quick actions

## UX priorities
1. Link-first open (single click on link row)
2. Drag current tab from right rail to center collection card to save bookmark
3. Collection-wide open actions are secondary

## Token set
- Background: `#F5F7FB`
- Surface: `#FFFFFF`
- Text primary: `#0F172A`
- Text secondary: `#64748B`
- Border subtle: `#E5EAF2`
- Accent: `#0A84FF`
- Accent soft: `#EAF3FF`

## Spacing scale
- 6 / 8 / 12 / 16 / 18 / 24

## Radius
- 10 / 14 / 18

## Elevation
- `0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)`

## Components
- Workspace rail (select/collapse)
- Collections board + drop target
- Link row (favicon, title, domain)
- Active tabs rail (draggable rows)
- Toast feedback

## Interaction rules
- Drag tab -> drop collection = bookmark.create
- No destructive actions without explicit consent
- Keyboard search keeps focus in top search field
