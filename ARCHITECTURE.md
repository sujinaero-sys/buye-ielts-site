# BUYE IELTS Architecture

## Catalogue

BUYE IELTS
- Academic
  - Reading
  - Writing
  - Full Mock
- General Training
  - Reading
  - Writing
  - Full Mock
- Shared
  - Listening
  - Speaking

## Engines

Listening uses the provided BUYE Listening framework as the initial exam-engine foundation.

Reading, Writing and Speaking will have module-specific engines.

Full Mock is an orchestration layer, not a separate question engine.

## Data Flow

Catalogue
  -> Module Engine
  -> Apps Script API
  -> Google Sheets
  -> Attempts / Responses / Results

## Safety

This architecture build does not deploy anything, modify Google Sheets, modify Apps Script, or push to production.
