# terraform init -backend-config=env/prod.backend.hcl
bucket         = "sbta-terraform-state"
key            = "prod/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "sbta-terraform-locks"
encrypt        = true
