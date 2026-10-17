#!/bin/sh

#
# Gradle wrapper script for kt-algochat
#

# Attempt to set APP_HOME
# Resolve links: $0 may be a link
app_path=$0
while
    APP_HOME=${app_path%"${app_path##*/}"}
    [ -h "$app_path" ]
do
    ls=$( ls -ld "$app_path" )
    link=${ls#*' -> '}
    case $link in
      /*)   app_path=$link ;;
      *)    app_path=$APP_HOME$link ;;
    esac
done

# Use Gradle from PATH or download
if command -v gradle >/dev/null 2>&1; then
    exec gradle "$@"
else
    echo "Gradle not found. Please install Gradle or use the Gradle wrapper."
    echo "Install via: brew install gradle (macOS) or sdk install gradle (SDKMAN)"
    exit 1
fi
