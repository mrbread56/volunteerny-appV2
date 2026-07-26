# Security Specification for Toronto Student Volunteer Platform

## 1. Data Invariants
- A student profile must belong to a user with the 'student' role.
- An organization profile must belong to a user with the 'organization' role.
- Only organizations can create or edit opportunities.
- Only students can apply for opportunities.
- An application must link a valid student and a valid opportunity.
- An application status can only be managed by the organization that owns the opportunity (except for initial creation by student).
- Students can only see their own private data and applications.
- Organizations can see all applications for their own opportunities.

## 2. The "Dirty Dozen" Payloads (Failure Cases)
1. **Identity Spoofing**: A student trying to create an opportunity claiming they are an organization.
2. **Privilege Escalation**: A user trying to change their role from 'student' to 'admin' (if admin existed, or just changing role in profile).
3. **Orphaned Record**: Creating an application for an opportunity that doesn't exist.
4. **State Shortcutting**: A student trying to 'accept' their own application.
5. **Unauthorized Access**: User A trying to read User B's saved opportunities.
6. **Data Poisoning**: Injecting a 2MB string into a 'title' field.
7. **Invalid ID**: Using a path variable containing malicious characters.
8. **Bypassing Invariants**: Creating an opportunity with a future `createdAt` date from the client.
9. **Role Mismatch**: An organization trying to create a 'student' profile for themselves.
10. **Application Overwrite**: Student A trying to delete or modify Student B's application message.
11. **Terminal State Break**: Trying to change an application status after it's been 'accepted' (if terminal logic applies).
12. **PII Leak**: An unauthorized user reading a student's private contact info without being a recruiter/org for an applied job.

## 3. Test Runner (Mock Tests Logic)
- `test('student cannot create opportunity')` -> expect failure
- `test('org cannot apply to opportunity')` -> expect failure
- `test('user cannot read others private profile')` -> expect failure
- `test('student can delete own saved opportunity')` -> expect success
- `test('org can update application status for their opportunity')` -> expect success
- `test('student cannot update application status')` -> expect failure
- `test('student can create profile only once and for own UID')` -> expect success
