FROM ubuntu:22.04

# Setup workspace directory
RUN mkdir /workspace
WORKDIR /workspace

# Install useful system utilities
ENV TZ=America/New_York
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install --yes \
    apt-transport-https \
    ca-certificates \
    curl \
    debian-keyring \
    debian-archive-keyring \
    git \
    gnupg \
    locales \
    postgresql-client \
    software-properties-common \
    sudo \
    tzdata \
    wget \
    zsh \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 from https://github.com/nodesource
ENV NODE_MAJOR 22
RUN mkdir -p /etc/apt/keyrings \ 
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install nodejs -y \
    && npm install -g npm@11.5.2 \
    && npm install -g @openai/codex \
    && rm -rf /var/lib/apt/lists/*

# Use a non-root user per https://code.visualstudio.com/remote/advancedcontainers/add-nonroot-user
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Add non-root user and add to sudoers
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME -s /usr/bin/zsh \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Set code to default git commit editor
RUN git config --system core.editor "code --wait"
# Set Safe Directory
RUN git config --system safe.directory '/workspace'

# Configure zsh
USER $USERNAME
ENV HOME /home/$USERNAME

# Add zsh theme with niceties
RUN curl https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh | bash - \
    && sed -i 's/robbyrussell/kennethreitz/g' ~/.zshrc \
    && echo 'export PATH=$PATH:$HOME/.local/bin' >>~/.zshrc

# Set Locale for Functional Autocompletion in zsh
RUN sudo locale-gen en_US.UTF-8

EXPOSE 5173