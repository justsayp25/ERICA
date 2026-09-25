# E.R.I.C.A. (Emergency Response & Immediate Contact Alert)

E.R.I.C.A. is a privacy-first personal-safety application built with React Native and Expo. It enables swift, reliable emergency alerting with location sharing, resilient offline dispatch queues, and local privacy guarantees.

---

## Phase 1 — Walking Skeleton Status

This codebase implements **Phase 1** of the roadmap:
- **App Shell**: Bottom-tab navigation connecting Home/SOS, Contacts, History, and Settings screens with SafeArea support.
- **Contacts CRUD**: Full Create, Read, Update, and Delete operations for trusted emergency contacts stored locally with AsyncStorage.
- **SOS Button & Cancellable Countdown**: State-machine driven (XState v5) emergency flow with dynamic countdown duration loaded from user settings.
- **Location Fetch**: Live location via `expo-location` with high accuracy and fallback to last-known coordinates, formatted as a Google Maps link.
- **SMS Dispatch**: Composer-based dispatch via `expo-sms` to all configured trusted contacts.
- **Local History Log**: Session logging for emergency triggers, resolutions, and timestamps with clear-log capability.

---

## Project Structure

```text
ERICA-sandbox/
├── assets/                  # App icons, splash screens, and adaptive assets
├── docs/                    # Architectural roadmap and design documents
│   └── ROADMAP.md           # Multi-phase engineering roadmap
├── src/
│   ├── app/                 # App navigation and root layout
│   │   ├── RootNavigator.tsx
│   │   └── index.ts
│   ├── features/            # Feature-sliced application modules
│   │   ├── contacts/        # Contacts management (CRUD + storage)
│   │   ├── dispatch/        # Emergency SMS dispatch service
│   │   ├── history/         # Emergency session logs and history screen
│   │   ├── location/        # Geolocation service and map link generator
│   │   ├── settings/        # User preferences and countdown configuration
│   │   └── sos/             # SOS state machine (XState) and trigger screen
│   └── index.ts             # Central feature export
├── App.tsx                  # Root application component with SafeAreaProvider
├── app.json                 # Expo configuration
├── CONTRIBUTING.md          # Workflow guidelines and engineering rules
├── index.ts                 # Expo entry point
├── LICENSE                  # MIT License
├── package.json             # Project dependencies and scripts
└── tsconfig.json            # TypeScript configuration
```

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Expo Go app on iOS or Android (or web browser for development verification)

### Running the App
```bash
# Install dependencies
npm install

# Start development server
npm run start

# Run on web
npm run web

# Run on Android (Expo Go)
npm run android

# Run on iOS (Expo Go)
npm run ios
```

### Type Checking
```bash
npx tsc --noEmit
```
