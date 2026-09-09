terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }

    # Used to generate the database password and the gateway shared secret, so
    # neither has to be invented by a human or committed anywhere.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in S3 with a DynamoDB lock so two applies cannot race.
  # Partial configuration: `terraform init -backend-config=env/prod.backend.hcl`.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "sbta-imessage-scheduler"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
