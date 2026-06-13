# Assessment — Peel the Image: Where a Workload's Control-Truth Is Baked In

**Competency artifact (not a quiz).** Unaided, from two real OCI images provided at assessment time —
a clean stock `alpine:latest` and a misconfigured `docker build` twin — the learner produces the
evidence below. Every value is read off the real manifest / config / layer tars; the ported OCI reader
is the verifier, and the content-addressable digest chain proves the images are unmodified.

## What the learner delivers

1. **The runtime-user finding.** From the misconfigured twin's config, the learner selects `User` and
   reads the uid the container runs as (`root → ROOT (uid 0)`). Gated by `region_labeled_correctly`
   against the reader's `config.user` node and `field_value_is` on the read value. Maps to CIS Docker
   4.1 / NIST 800-190 §4.4.2 / NIST 800-53 CM-6.

2. **The exposed-port finding.** The learner selects `ExposedPorts` and reads the declared listening
   ports (`22/tcp, 8080/tcp` — SSH alongside the app port). Gated by `region_labeled_correctly` and
   `field_value_is`. Maps to CIS Docker 5.7 / CM-7 (least functionality).

3. **The baked-secret finding.** The learner peels the topmost layer descriptor (reading its real
   sha256 digest as provenance), then peels that layer's tar and selects the secret-bearing file
   (`/app-credentials.env`). Gated by `region_labeled_correctly` and `field_value_is` against the
   reader's tar walk — the secret is read off the real bytes, and survives even a later "delete." Maps
   to CIS Docker 4.10 / IA-5 / SC-28.

4. **The findings → controls map (and VM vs. container).** The learner places each finding onto its
   CIS / NIST control zone (runs-as-root → CM-6, exposed ports → CM-7, baked secret → IA-5/SC-28) and
   places the VM and container cards onto the kernel each uses (VM → own host kernel, container →
   shared host kernel), drawing the blast-radius difference. Gated by `mapping_correct` against the
   cited key.

5. **A Diff-the-Trace finding sheet.** Comparing the clean baseline against the misconfigured twin, the
   learner clicks the single field where the twin breaks each control claim and produces a finding
   sheet stating, per finding, the field, both values (clean vs. broken), the control it breaks, and
   the framework reference — re-derivable by anyone from the same image bytes.

## Honesty

Both images are real manifests / configs; the clean twin is stock `alpine:latest` straight off Docker
Hub, the misconfigured twin a real `docker build` (`docker save` of the recorded Dockerfile). The
misconfigured twin is a genuine instance of each finding: a real `User: root`, real `EXPOSE 22 8080`,
and a real credential written into a real layer tar (a documented AWS *example* key, not a live secret,
but really baked in). The baked secret is read straight from the decompressed `secret-layer.tar.gz` by
the same credential-pattern set a secret scanner uses. The discriminating field is the reader's
computed divergence over the two real images, and the content-addressable digest chain
(`oci-fidelity.test.ts`) proves the blobs are unmodified. There is no answer key; the reader is the
answer key — anyone can `docker save` the same tags and recompute the identical digests.
