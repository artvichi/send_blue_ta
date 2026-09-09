# The deployed system is the server, the database and the static web app.
#
# The gateway is deliberately absent: it needs Messages.app and a signed-in Apple
# account, so it runs on a Mac (on-prem, MacStadium, or an EC2 mac2.metal
# instance) and dials out to the API over ordinary HTTPS.
#
# Because it dials out, no inbound rule, VPN, public IP or port forward is needed
# for it anywhere in this configuration. That is the whole payoff of the
# pull-based transport -- see docs/adr/0003-pull-based-gateway.md.

locals {
  name = "sbta-${var.environment}"
}

module "network" {
  source = "./modules/network"

  name     = local.name
  vpc_cidr = var.vpc_cidr
}

module "data" {
  source = "./modules/data"

  name               = local.name
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  instance_class     = var.db_instance_class

  # Only the API's security group may reach Postgres.
  allowed_security_group_ids = [module.app.service_security_group_id]
}

module "app" {
  source = "./modules/app"

  name               = local.name
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  private_subnet_ids = module.network.private_subnet_ids
  image_tag          = var.image_tag
  desired_count      = var.server_desired_count

  # Credentials are never rendered into the task definition; the task pulls them
  # from Secrets Manager at start.
  database_url_secret_arn  = module.data.connection_secret_arn
  gateway_token_secret_arn = module.data.gateway_token_secret_arn
}

module "web" {
  source = "./modules/web"

  name        = local.name
  domain_name = var.domain_name
}
