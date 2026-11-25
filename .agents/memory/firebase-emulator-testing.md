---
name: Local Firebase emulator testing
description: Runtime and port constraints for isolated Auth, Firestore, and Storage checks in this workspace
---
Use JDK 21 for the current Firebase Emulator Suite CLI. The default Java Tools module supplied Java 19, and ports 8080 and 18080 are occupied in this Replit workspace; keep emulator services on the dedicated 28xxx/29xxx ports in the test runner.

**Why:** Real admin export checks must use local Auth, Firestore, and Storage data without writing to production.

**How to apply:** Use the emulator test runner's temporary root config and dedicated ports. Do not point these checks at the production Firebase project.
