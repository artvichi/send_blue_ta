variable "name" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "image_tag" { type = string }
variable "desired_count" { type = number }
variable "database_url_secret_arn" { type = string }
variable "gateway_token_secret_arn" { type = string }

data "aws_region" "current" {}

resource "aws_ecr_repository" "server" {
  name                 = "${var.name}-server"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_cloudwatch_log_group" "server" {
  name              = "/ecs/${var.name}-server"
  retention_in_days = 30
}

resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# --- networking --------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public entry point."
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from anywhere, including the Mac running the gateway"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# The API tasks accept traffic only from the load balancer. Note there is no rule
# anywhere for inbound gateway traffic: the gateway dials out, so it arrives as
# an ordinary HTTPS client.
resource "aws_security_group" "service" {
  name        = "${var.name}-service"
  description = "API tasks."
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 4310
    to_port         = 4310
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "From the ALB only"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "this" {
  name               = var.name
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [aws_security_group.alb.id]

  drop_invalid_header_fields = true
  enable_deletion_protection = true
}

resource "aws_lb_target_group" "server" {
  name        = "${var.name}-server"
  port        = 4310
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/readyz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }

  # Long-poll lease requests hold a connection for up to 25 seconds, so the
  # deregistration delay must outlast one in-flight request.
  deregistration_delay = 40
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.server.arn
  }
}

variable "certificate_arn" {
  description = "ACM certificate for the API listener."
  type        = string
  default     = ""
}

# --- task --------------------------------------------------------------------

resource "aws_iam_role" "execution" {
  name = "${var.name}-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Scoped to exactly the two secrets this service needs, not to Secrets Manager
# as a whole.
resource "aws_iam_role_policy" "secrets" {
  name = "${var.name}-read-secrets"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [var.database_url_secret_arn, var.gateway_token_secret_arn]
    }]
  })
}

resource "aws_ecs_task_definition" "server" {
  family                   = "${var.name}-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name      = "server"
    image     = "${aws_ecr_repository.server.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{ containerPort = 4310, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "4310" },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = var.database_url_secret_arn },
      { name = "GATEWAY_TOKEN", valueFrom = var.gateway_token_secret_arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.server.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "server"
      }
    }
  }])
}

# Running several tasks is already safe: FOR UPDATE SKIP LOCKED plus the
# persisted-timestamp rate gate means concurrent instances cannot both win the
# same interval slot. No leader election is required.
resource "aws_ecs_service" "server" {
  name            = "${var.name}-server"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.server.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.server.arn
    container_name   = "server"
    container_port   = 4310
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
}

output "alb_url" { value = "https://${aws_lb.this.dns_name}" }
output "ecr_repository_url" { value = aws_ecr_repository.server.repository_url }
output "service_security_group_id" { value = aws_security_group.service.id }
