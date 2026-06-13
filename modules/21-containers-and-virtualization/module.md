# Module 21 — Peel the Image: Where a Workload's Control-Truth Is Baked In

*Loop stages: LOCATE · QUERY · EVALUATE · EVIDENCE. Tier-1, IT-foundations band. Original content; third-party material is confined to §8. When a control claims "no secrets in the image" or "containers don't run as root," this is the module where you learn exactly where in the image — which config field, which layer, which sha256 digest — that claim's truth physically lives, and how to read it straight off the real bytes.*

---

## 1. Learning Objectives

By the end of this module you can:

1. **Explain**, to a non-technical colleague, the difference between a virtual machine (its own guest kernel, hardware-virtualized) and a container (sharing the host kernel, isolated by namespaces and cgroups), and why that difference changes the blast radius of a compromise.
2. **Peel** a real OCI image manifest into its config (User, ExposedPorts, Env, Cmd) and its ordered layer descriptors with their real sha256 digests, reading each field as control-truth.
3. **Locate** a baked-in secret by peeling the layer whose tar content carries it, citing the real layer digest as the provenance.
4. **Diagnose** the misconfigured-container findings — runs as root (config.User uid 0), an unexpected exposed port — by reading the real config fields rather than trusting a scan summary.
5. **Map** each container finding onto its CIS Docker Benchmark / NIST SP 800-190 control and NIST 800-53 reference (CM-6, CM-7, IA-5 / SC-28).
6. **Produce** an evidence finding naming the field, its value, the control it breaks, and the framework reference — re-derivable by anyone from the same image bytes.

Each objective is checked by the Assessment in §7. If you can already produce the §7 finding sheet unaided, this module is your placement test — pass it and move on.

---

## 2. Why this matters for GRC

You have learned to read a control claim where it sits still — a row in a table, a field in a JSON document, a byte on the wire. A container image is the next place a claim hides, and it is the one most auditors take entirely on faith. Someone shows you a green dashboard from an image scanner and says "the image is hardened." But the scanner is reading the same bytes you can read — and a control claim about an image is a claim about *specific fields in specific files inside that image*. "Containers don't run as root" is a claim about one field: `config.User`. "Only the service port is exposed" is a claim about `config.ExposedPorts`. "No secrets in the image" is a claim about the contents of the layer tars. Each of those is readable, and reading it yourself is the difference between an auditor who can be told a comforting story and one who opens the box.

An OCI image is not magic. It is a small manifest that points at a config blob and an *ordered stack of layers*, each addressed by its sha256 digest. The manifest and config are JSON you can read; the layers are tar archives. The most important and most counter-intuitive fact follows directly from that structure: **a secret added in one layer survives even if a later layer "deletes" the file.** Layers are diffs stacked on top of each other; a `RUN rm /app-credentials.env` in layer 3 adds a whitewash marker, but the credential is still sitting in layer 1's tar, recoverable by anyone who pulls the image and peels that layer. The digest of the layer that added it is the provenance you cite in the finding.

This module also draws the line under everything: the difference between a virtual machine and a container. A VM ships its own guest kernel and is virtualized at the hardware boundary; a container shares the host's kernel and is fenced off only by namespaces and cgroups. That single fact — shared kernel vs. own kernel — is why a container escape has a larger blast radius than a VM escape, and why "runs as root inside the container" is not the harmless thing developers often assume: root in the container is one kernel bug away from root on the host. The discipline this builds is reading the image as evidence: locate the field, read its value off the real bytes, name the control it breaks, and cite the layer digest — no scanner required.

---

## 3. The Mental Model

Think of a container image as a stack of clear acetate sheets, the kind an old overhead projector used. The bottom sheet is the base operating system. Each instruction in the build paints a new sheet and drops it on top: one sheet adds your application, one sets an environment variable, one writes a file. Stack them all and shine a light through, and what you see projected is the final filesystem — every sheet's marks combined. That stack is the image's **layers**, and each sheet is sealed with a tamper-evident sticker: its sha256 digest. Change one mark on one sheet and its sticker no longer matches, so you can always prove which sheet is which.

Two facts about acetate sheets carry the whole module. First, the order matters and the sheets are permanent. If sheet 1 writes a password to a file and sheet 3 scribbles over it, the projected image looks clean — but lift sheet 3 off and sheet 1 still has the password, in ink, forever. That is exactly why a baked-in secret is recoverable: peeling the stack shows you every sheet, and the secret glows on the sheet that added it. The sticker on that sheet (its digest) is the provenance you write down. Second, sitting on top of the stack is a small index card — the **config** — that records how the projector should run the show: which user runs it (`User`), which ports it announces (`ExposedPorts`), what environment it carries (`Env`), and the command it starts with (`Cmd`). The control claims live on that index card and on the sheets, and reading them is just lifting the right sheet or the right line of the card.

Now the difference between a container and a virtual machine, in shipping terms. A **virtual machine** is a whole ship: it brings its own engine room (its own kernel) and is sealed off from the dock by steel. If something goes wrong in one ship's engine room, it stays in that ship. A **container** is a locked cabin on a shared ship: every container gets its own private cabin (namespaces) with a metered share of food and power (cgroups), but they all share the one ship's engine room — the host kernel. That sharing is what makes containers light and fast to launch, and it is also why the blast radius is bigger: break out of your cabin and exploit the shared engine, and you are loose on the whole ship, not just one boat in a fleet. So "runs as root inside the container" matters more than it looks — root in the cabin, plus one bug in the shared engine, is root on the ship. The reader is the oracle: every value you read in this module is the real OCI reader's decode of the real image, never an answer key.

---

## 4. Concepts

### 4.1 VM vs. container — the shared kernel is the whole story

A **virtual machine** runs a full guest operating system, including its own kernel, on top of a hypervisor that virtualizes the hardware. The isolation boundary is the hardware-virtualization layer, and it is strong: a VM has its own kernel, so a compromise inside one guest does not directly hand the attacker the host or its neighbors. The cost is weight — every VM carries a whole OS. A **container** shares the host's kernel and is isolated by Linux primitives: **namespaces** (each container gets its own view of processes, network, mounts, users) and **cgroups** (each gets a metered share of CPU, memory, I/O). The boundary is a kernel-enforced fence, not a separate kernel. That is why containers start in milliseconds and pack densely — and why the blast radius of a container escape is larger: a kernel-level escape lands the attacker on the shared host kernel, alongside every other container. This single distinction is why container hardening leans so hard on *not running as root* and *dropping capabilities*: you are reducing what a process can do to the kernel everyone shares.

### 4.2 The config is the index card: User, ExposedPorts, Env, Cmd

An OCI image carries a **config** blob — JSON describing how the runtime should start the workload. Four fields hold most of the control-truth a GRC engineer reads:

- **`User`** — the uid (or username) the container's processes run as. The OCI runtime default when `User` is absent is **root (uid 0)**, so an image with no explicit non-root user runs as root by default. `User: root` or `User: 0`, or an absent `User`, is the CIS Docker 4.1 / NIST 800-53 **CM-6** finding ("run as non-root").
- **`ExposedPorts`** — the ports the image declares it listens on. An app image that exposes 22 (SSH) alongside its service port violates least functionality — CIS Docker 5.7 / **CM-7**.
- **`Env`** — environment variables baked into the image. Often benign, occasionally where a developer hardcodes a credential (which is then visible to anyone who pulls the image).
- **`Cmd`** / **`Entrypoint`** — the command the container starts with.

You read each field straight off the real config; the reader's decode is the value, not a summary someone wrote.

### 4.3 The manifest is an ordered stack of content-addressed layers

The **image manifest** is the index: it points at the config blob by digest and lists the **layers** as an ordered array of descriptors, each carrying a `mediaType`, a `size`, and a **sha256 digest**. The order is load-bearing — layers stack bottom to top, each a filesystem diff applied over the one below. Because every layer is addressed by the sha256 of its bytes, the image is **content-addressable**: change a single byte in a layer and its digest no longer matches, so the manifest's cited digest is a tamper-evident pointer. When you find something in a layer, the layer's digest is the provenance you cite — it identifies *exactly* which content carried the finding, and anyone can recompute it.

### 4.4 A secret in a layer survives a later "delete"

Layers are diffs, and diffs are permanent. If a build does `RUN echo "AWS_SECRET_ACCESS_KEY=…" > /app-credentials.env` in one layer and `RUN rm /app-credentials.env` in a later one, the projected filesystem looks clean — but the earlier layer's tar still contains the credential in full. The later "delete" only adds a whiteout marker; it cannot rewrite history in an immutable, content-addressed stack. So the way you find a baked secret is to peel each layer's tar and read its contents directly: the secret lives in the layer that *added* it, and that layer's digest is the provenance. This is IA-5 / SC-28 / CIS Docker 4.10 ("no secrets baked into the image"), and it is the single most common reason a "scrubbed" image still leaks. The honest reader walks the real tar bytes and the same credential-pattern set a secret scanner uses trips on the real string — the secret genuinely lives in those bytes.

### 4.5 Map each finding to its control — CIS Docker, 800-190, 800-53

The container findings map cleanly onto established hardening controls:

- **Runs as root** (`config.User` = root / uid 0 / absent) → CIS Docker Benchmark 4.1, NIST SP 800-190 §4.4.2, NIST 800-53 **CM-6** (configuration settings / least privilege at the runtime user).
- **Unexpected exposed port** (`config.ExposedPorts` lists more than the service needs) → CIS Docker 5.7, NIST 800-53 **CM-7** (least functionality).
- **Baked-in secret** (a credential in a layer's tar) → CIS Docker 4.10, NIST 800-53 **IA-5** (authenticator management) and **SC-28** (protection of information at rest).

NIST SP 800-190 (the Application Container Security Guide) is the vendor-neutral spine; the CIS Docker Benchmark is the line-item checklist; 800-53 is the control family the finding rolls up to. The finding is read off the real image; the mapping is the cited key.

### 4.6 A control claim is a predicate over the image

Put it together and a control claim becomes a precise, re-derivable predicate over the image's fields. "Containers don't run as root" is `config.User` resolves to a non-zero, non-root uid. "Only the service port is exposed" is `config.ExposedPorts` equals exactly the service port set. "No secrets in the image" is *no layer tar contains a credential-shaped string*. Diff a hardened image against a misconfigured twin and exactly one field per claim diverges — and that divergence is the reader's computed fact over two real images, not your opinion. Your evidence finding names the field, both values (clean vs. broken), the control it breaks, and the framework reference, and anyone can `docker save` the same images and recompute the identical answer.

---

## 5. Worked Examples

The container control claims in practice. A GRC engineer's job is not to memorize the OCI spec — it is to know, for each claim, *which field in the image holds its truth* and *which control it rolls up to*.

- **Runs as non-root**: the evidence is `config.User`. A non-root uid satisfies CM-6; root, uid 0, or an absent `User` (which defaults to root) is the finding. Read the field; don't trust the scan summary.
- **Least functionality**: the evidence is `config.ExposedPorts`. Exactly the service port satisfies CM-7; an extra port (especially 22/SSH on an app image) is the finding.
- **No secrets in the image**: the evidence is the layer tars. Peel each layer and confirm no credential-shaped content; the finding is the layer (cited by digest) whose tar carries the secret. Remember a later "delete" does not erase it — IA-5 / SC-28.
- **Isolation strength**: the evidence is the architecture, not a field. A VM has its own kernel (stronger isolation, larger footprint); a container shares the host kernel (lighter, larger blast radius). This is why container hardening fixates on the runtime user and dropped capabilities.

---

## 6. Guided Lab

> **Interactive lab.** This lab runs in your browser on the bootcamp site (Module 21 → Interactive lab) as the Inspect-&-Assemble surface: two real OCI images — a clean stock alpine and a misconfigured `docker build` twin — rendered as nested, keyboard-selectable regions over the real manifest, config, and layer tars. Selecting a node reveals the `oci` reader's real decode (the same fields `docker inspect` shows), and the baked secret is read straight from the real, decompressed layer tar by the same credential-pattern set a secret scanner uses. The content-addressable digest chain is recomputed against the committed blobs, so the fixtures cannot silently drift. Every task is machine-verified against that parse tree. No install, no live daemon, no answer key — the reader is the oracle.

The exercise (`exercises/exercise.yaml`) drives the **visual** Inspect-&-Assemble surface across three mechanics over two real images:

1. **PEEL the OCI manifest + config** — select `config.User` (root, uid 0 — CM-6), `config.ExposedPorts` (22 + 8080 — CM-7), and the ordered layer descriptors (each with its real sha256 digest), reading each field as control-truth.
2. **Find the baked-in secret in a layer** — peel the topmost layer's tar and select the secret-bearing file (`/app-credentials.env`), citing the layer digest as provenance — the lesson that a secret survives a later "delete."
3. **MAP the findings onto CIS / NIST controls (and VM vs. container)** — place each finding on its control zone (runs-as-root → CM-6, exposed ports → CM-7, baked secret → IA-5/SC-28) and place the VM and container cards on the kernel each uses, drawing the blast-radius difference.
4. **Diff-the-Trace** — the clean and misconfigured images side by side; click the single field where the twin breaks each control claim (the Assessment).

Every value shown is the real OCI reader's decode of the real image — fidelity-checked against the content-addressable digest chain (each manifest cites its config and layers by sha256, and those digests recompute over the committed blobs). There is no answer key. The reader is the oracle.

---

## 7. Assessment

Forensic **Diff-the-Trace + produced finding** (EVALUATE / EVIDENCE). You are given two REAL OCI images — a clean stock `alpine:latest` and a misconfigured twin built by a real `docker build` (`docker save` of the recorded Dockerfile) — and, unaided, you:

1. click the exact field where the twin breaks each control claim — `config.User` reading root/uid 0 (runs as root — CM-6), `config.ExposedPorts` reading 22 + 8080 (unexpected exposed port — CM-7), and the layer whose tar bakes in `/app-credentials.env` (baked secret — IA-5/SC-28), each verified by `region_labeled_correctly` / `field_value_is` against the OCI reader;
2. map each finding onto its CIS Docker / NIST 800-190 / 800-53 control with `mapping_correct` (cited key);
3. produce a finding sheet stating, per finding, the field, its value, the control it breaks, and the framework reference.

`region_labeled_correctly` gates each clicked field against the real reader's parse tree; `field_value_is` gates the read value against the reader's decode; `mapping_correct` gates the findings-to-controls grid (cited to the CIS Docker Benchmark + NIST SP 800-190 + NIST 800-53). Pass threshold: 0.80 on every objective. Both images are real manifests/configs; the misconfigured twin is a real instance (real root uid, real exposed ports, a real secret-bearing layer), and the discriminating field is the reader's computed divergence over the two — re-derivable by `docker save`-ing the same tags and recomputing the digests.

---

## 8. Supplemental Learning Material

- OCI Image Format Specification (image-manifest, image-config, layer) — github.com/opencontainers/image-spec
- NIST SP 800-190 — Application Container Security Guide — csrc.nist.gov/pubs/sp/800/190/final
- CIS Docker Benchmark — cisecurity.org/benchmark/docker
- NIST SP 800-53 Rev. 5 — CM-6, CM-7, IA-5, SC-28 — csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- Docker image and layer internals — docs.docker.com/build/guide/layers
- AWS example access keys (documentation credentials, not live) — docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html
