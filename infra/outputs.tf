output "api_url" {
  description = "Public URL of the API, and the SERVER_URL the gateway dials out to."
  value       = module.app.alb_url
}

output "web_url" {
  description = "Public URL of the scheduler UI."
  value       = module.web.cloudfront_url
}

output "ecr_server_repository" {
  description = "ECR repository the release workflow pushes the API image to."
  value       = module.app.ecr_repository_url
}

output "gateway_setup" {
  description = "What to configure on the Mac that runs the gateway."
  value       = <<-EOT
    Run the gateway on a Mac with Messages signed in:

      SERVER_URL=${module.app.alb_url}
      GATEWAY_TOKEN=<value of ${module.data.gateway_token_secret_arn}>
      GATEWAY_DRIVER=applescript

    The gateway dials out over HTTPS, so it needs no inbound network access.
  EOT
}
