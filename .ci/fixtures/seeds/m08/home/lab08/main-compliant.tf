# Compliant remediation. This is what produces checkov-compliant.json.
# Encrypted at rest, private ACL, versioning on, access logging configured.
resource "aws_s3_bucket" "evidence" {
  bucket = "grc-evidence-store"
}

resource "aws_s3_bucket_acl" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  acl    = "private"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_logging" "evidence" {
  bucket        = aws_s3_bucket.evidence.id
  target_bucket = "grc-access-logs"
  target_prefix = "evidence/"
}
