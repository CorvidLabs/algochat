plugins {
    kotlin("jvm") version "2.1.20"
    kotlin("plugin.serialization") version "2.1.20"
    `java-library`
    `maven-publish`
}

group = "com.corvidlabs"
version = "0.2.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.bouncycastle:bcprov-jdk18on:1.80")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")

    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.4")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
}

kotlin {
    jvmToolchain(17)
}

java {
    withSourcesJar()
    withJavadocJar()
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])

            pom {
                name.set("AlgoChat")
                description.set("Kotlin implementation of the AlgoChat protocol for encrypted messaging on Algorand")
                url.set("https://github.com/CorvidLabs/kt-algochat")

                licenses {
                    license {
                        name.set("MIT License")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }

                developers {
                    developer {
                        id.set("corvidlabs")
                        name.set("CorvidLabs")
                        email.set("hello@corvidlabs.com")
                    }
                }

                scm {
                    connection.set("scm:git:git://github.com/CorvidLabs/kt-algochat.git")
                    developerConnection.set("scm:git:ssh://github.com/CorvidLabs/kt-algochat.git")
                    url.set("https://github.com/CorvidLabs/kt-algochat")
                }
            }
        }
    }

    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/CorvidLabs/kt-algochat")
            credentials {
                username = System.getenv("GITHUB_ACTOR")
                password = System.getenv("GITHUB_TOKEN")
            }
        }
    }
}
