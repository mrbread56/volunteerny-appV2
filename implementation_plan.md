# Implementation Plan

This document outlines the planned fixes for all vulnerabilities and silent failure points discovered during the QA audit of the Volunteer NY app.

## User Review Required
Please review the proposed fixes below. These changes address critical security vulnerabilities and UI failure modes that would otherwise block the launch.

## Proposed Changes

### 1. `firestore.rules` (Security & Validation)

#### [MODIFY] [firestore.rules](file:///C:/Users/ASUS/Downloads/VNY_V14/firestore.rules)
- **Fix Unbounded Applications:** Update `isValidApplication(data)` to strictly enforce type and size limits for `rejectionReason` (e.g., max 300 chars) and `rejectionNote` (e.g., max 2000 chars) to prevent document bloat.
- **Fix Unbounded Opportunities:** The `update` block for the `opportunities` collection lacks a `hasOnly` clause, allowing orgs to inject arbitrary fields up to 1MiB. Add a `hasOnly()` clause to restrict updates to valid fields only.
- **Fix Unbounded Interest Requests:** The `update` block for the `interestRequests` collection also lacks a `hasOnly` clause. Add a `hasOnly()` clause to restrict updates to the fields validated by `isValidInterestRequest`.

- **Fix Infinite Loading Hang:** Implement a timeout mechanism in the route guards (or `AuthContext`) so that if the authentication state is stuck in `loading` for more than 10 seconds, it falls back to an error state rather than showing a white screen with "Loading..." indefinitely.

## Verification Plan

### Automated Tests
- Run `npm test` to ensure existing checks continue to pass.
- Run `npx playwright test` to verify e2e journeys.

### Manual Verification
- Attempt to inject oversized data into `applications` and `opportunities` via the browser console to verify Firestore rules block it.
- Force a network failure when replying to feedback in the Developer Dashboard and verify an error banner appears.
- Force a network failure when accepting an application in the Org Dashboard and verify an error banner appears.
- Ensure demo mock data does not render in a production environment.
