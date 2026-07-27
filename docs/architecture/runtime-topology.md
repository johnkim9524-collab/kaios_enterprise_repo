\# KAIOS 2.0 Runtime Topology



\## Current Topology



```text

GitHub Repository

&#x20;       |

&#x20;       v

GitHub Actions or Local Python Runtime

&#x20;       |

&#x20;       v

scripts/run\_kaios.py

&#x20;       |

&#x20;       v

KAIOSAgent

&#x20;       |

&#x20;       +--> Collector

&#x20;       +--> Normalizer

&#x20;       +--> Score Engine

&#x20;       +--> Intelligence Writer

&#x20;       +--> Quality Gate

&#x20;       +--> Publisher

&#x20;       +--> Health Monitor

&#x20;       |

&#x20;       v

public/

&#x20;       |

&#x20;       v

Cloudflare Pages or Static Hosting
