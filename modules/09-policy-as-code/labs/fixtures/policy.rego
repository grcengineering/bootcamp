# Control AC-6-legacy-admin: access changes must never grant the legacy-admin role.
# Rego frames the same verdict as a query that collects denials over arbitrary JSON.
# A request is rejected when deny is non-empty.
package access

import rego.v1

deny contains msg if {
    input.action == "grantRole"
    input.resource.role == "legacy-admin"
    msg := "granting the legacy-admin role is forbidden"
}
