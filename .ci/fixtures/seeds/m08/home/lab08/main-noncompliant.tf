# Deliberately non-compliant. This is what produces checkov-noncompliant.json.
# No server-side encryption, public-read ACL, no versioning. Three controls violated.
resource "aws_s3_bucket" "evidence" {
  bucket = "grc-evidence-store"
}

resource "aws_s3_bucket_acl" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  acl    = "public-read"
}
