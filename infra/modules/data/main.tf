variable "name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "instance_class" { type = string }
variable "allowed_security_group_ids" { type = list(string) }

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "Postgres. Reachable only from the API tasks."
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Referenced by security group rather than by CIDR, so the rule stays correct as
# the API scales and its addresses change.
resource "aws_security_group_rule" "db_from_app" {
  count = length(var.allowed_security_group_ids)

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db.id
  source_security_group_id = var.allowed_security_group_ids[count.index]
  description              = "Postgres from the API service"
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = "17.2"
  instance_class = var.instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true

  db_name  = "sbta"
  username = "sbta"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  backup_retention_period   = 7
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.name}-final"

  performance_insights_enabled = true
  auto_minor_version_upgrade   = true
}

# Secrets are stored, never rendered into a task definition or a log line.
resource "aws_secretsmanager_secret" "database_url" {
  name = "${var.name}/database-url"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql://%s:%s@%s/%s?schema=public&sslmode=require",
    aws_db_instance.this.username,
    random_password.db.result,
    aws_db_instance.this.endpoint,
    aws_db_instance.this.db_name,
  )
}

# The shared secret the Mac gateway presents. Generated here so it never has to
# be invented by a human or committed anywhere.
resource "random_password" "gateway_token" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "gateway_token" {
  name = "${var.name}/gateway-token"
}

resource "aws_secretsmanager_secret_version" "gateway_token" {
  secret_id     = aws_secretsmanager_secret.gateway_token.id
  secret_string = random_password.gateway_token.result
}

output "connection_secret_arn" { value = aws_secretsmanager_secret.database_url.arn }
output "gateway_token_secret_arn" { value = aws_secretsmanager_secret.gateway_token.arn }
output "endpoint" { value = aws_db_instance.this.endpoint }
