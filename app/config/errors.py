class ConfigurationError(ValueError):
    """Raised when the KAIOS configuration contract is invalid."""


class MissingConfigurationError(ConfigurationError):
    """Raised when a required configuration value is missing."""


class SecretFileError(ConfigurationError):
    """Raised when a configured secret file cannot be read safely."""