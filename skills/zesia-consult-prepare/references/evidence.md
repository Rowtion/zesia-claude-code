# Engineering evidence

For implementation review: requirements or intended behavior, exact diff/base revision where available, affected functions with important callers/callees, boundary conditions and deployment assumptions. Do not require a commit in a dirty or unversioned workspace.

For diagnosis: exact symptom and error, expected behavior, reproducible trigger, versions/configuration, observations across component boundaries, attempts and outcomes. Distinguish an existing incident from a hypothetical failure path.

For concurrency or reliability: operation order, ownership and commit points, lease/lock scope and loss behavior, persistence topology, side effects, and the tests that actually exercised those paths. Counts alone do not verify artifact contents or transactional guarantees.

For each evidence item preserve its source, excerpt or exact command/output, tested scope and unavailable portions. Read selectively; do not run a full repository audit just to prepare a consultation.
