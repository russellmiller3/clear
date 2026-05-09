# Checkable Requirements Samples

Meph should use this file when a user gives a vague app request. The job is to translate the ask into small, observable requirements that Ralph can check after the app is built.

## Checkable Requirement Types

- **Data shape:** what records exist and which fields they store.
- **CRUD lifecycle:** create, read/list/detail, update/action, delete/cancel/archive.
- **Roles and permissions:** who can see or change which records.
- **Routing:** what condition sends work to which owner, queue, or role.
- **Domain rule:** what invalid state must be rejected.
- **Concurrency:** what stale or duplicate action must not overwrite state.
- **Audit:** what change is recorded, with actor and timestamp.
- **Navigation and UI reachability:** which pages, tables, forms, and actions must be reachable.
- **Runtime evidence:** what must be proven by running, clicking, calling an endpoint, or reading state.

## Vague User Ask -> Checkable Requirements

User asks:

```text
Build me a deal approval app.
```

Good requirements:

```clear
requirements:
  sellers can submit deals with customer, amount, notes, and status
  deals are listed with customer, amount, status, and assigned approver
  deals below 50000 route to manager approval
  deals at least 50000 route to VP approval
  approvers only see pending deals assigned to their role
  approvers can approve or reject a pending deal
  approving or rejecting a deal changes status and records the approver
  two simultaneous approval actions cannot overwrite each other
  status changes are recorded with actor and timestamp
  the app has reachable pages for submitting deals and reviewing the approval queue
```

Bad requirements:

```clear
requirements:
  the app should be robust
  the approval workflow should work well
  users need a dashboard
```

Why bad: these do not name data, actor, action, rule, or evidence.

## Approval queue

```clear
requirements:
  requesters can create approval requests with title, amount, owner, and status
  pending requests are visible in an approval queue
  amount-based routing assigns each request to the correct approver role before save
  approvers can approve or reject only pending requests
  each approval decision records actor, timestamp, previous status, and new status
  stale approval submissions return a conflict instead of overwriting the first decision
  queue navigation, request detail, approve, and reject controls are reachable
```

## Booking calendar

```clear
requirements:
  customers, rooms, and bookings are stored
  users can create bookings with customer, room, start time, end time, and status
  users can list bookings by room and date
  same-room overlapping bookings are rejected before save
  users can cancel an existing booking
  cancellation changes status and keeps the original booking record
  calendar page, booking form, room list, and cancel action are reachable
```

## Internal Request Tracker

```clear
requirements:
  employees can submit requests with category, priority, owner, due date, and status
  managers can list open requests by priority and owner
  high-priority requests route to the operations lead
  managers can assign, resolve, or reopen a request
  each status change records actor, timestamp, old status, and new status
  closed requests cannot be edited unless they are reopened first
  list, detail, assign, resolve, and reopen controls are reachable
```

## Rule Of Thumb

If a requirement cannot answer these four questions, rewrite it:

```text
Who acts?
What data changes or appears?
What rule decides the outcome?
How can Ralph observe it?
```
