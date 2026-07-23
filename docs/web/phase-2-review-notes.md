WEB-P Phase 2 whole-branch review — student-edit/fees finding

This note captures one specific finding from the final whole-branch review
of WEB-P Phase 2 (Teacher core), written to a file because it repeatedly
failed to come through cleanly via chat relay.

What was checked about student-edit and fees

The phase brief explicitly ruled two of the four pre-existing TEACHER 403
bugs out of scope for this phase: TEACHER should never get a student-edit
affordance at all, and the fees view is correctly excluded for TEACHER by
design. The reviewer grepped the entire new (portal)/teacher route tree for
any student-edit affordance (an updateStudent call or any edit UI) and any
fees, finance, invoice, or payment view. Neither was found anywhere. The
(portal) tree contains exactly the five pages this phase built and nothing
else. This confirms Phase 2 did not accidentally build either of the two
pre-existing 403 bugs that were explicitly ruled out of scope.

What the "client-side check mistaken for a security boundary" point means

The reviewer checked every new write path this phase added: bulk-mark
attendance, bulk-enter marks, create assignment, publish or close an
assignment, and review a submission. Each of these calls its backend
endpoint directly, with no role check and no ownership check added anywhere
on the frontend. The section, schedule, and class pickers default to the
teacher's own scope as a convenience, but each one always offers a way to
reach the broader list, and nothing blocks submitting outside that default.

The point being made: it would be easy, while building pickers that default
to "my own sections," to accidentally add a client-side gate that looks
like it is enforcing the underlying soft-scope invariant — the invariant
being that any teacher can act on any section or schedule, with
accountability recorded via the marked_by or entered_by fields rather than
a permissions gate. If such a client-side gate were added, the frontend and
backend would end up with two sources of truth that disagree, and the
frontend one would be the wrong one to trust.

The reviewer confirmed this did not happen anywhere in this phase. The
frontend stays purely a UX convenience; the backend remains the only real
boundary, consistent with this project's established SEC-2 convention that
role/permission enforcement lives on the server, not in the client.
