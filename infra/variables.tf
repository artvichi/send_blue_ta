variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name, used in resource names and tags."
  type        = string
}

variable "image_tag" {
  description = "Container image tag to deploy. Always a git SHA, never 'latest'."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "server_desired_count" {
  description = "Number of ECS tasks for the API."
  type        = number
  default     = 2
}

variable "domain_name" {
  description = "Public domain for the web app. Empty disables ACM and custom domains."
  type        = string
  default     = ""
}
