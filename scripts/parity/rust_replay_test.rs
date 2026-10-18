    // This probe is injected into a temporary copy of the existing tests module.
    // It checks the required outcome rather than asserting that a bug persists.
    #[tokio::test]
    async fn parity_concurrent_receive_rejects_duplicate_plaintext() {
        let iterations: usize = std::env::var("ALGOCHAT_PARITY_REPLAY_ITERATIONS")
            .expect("the probe runner supplies an iteration count")
            .parse()
            .expect("the iteration count is a positive integer");
        assert!(iterations > 0);

        let alice = make_alice_client(MockIndexer::new()).await;
        let bob = make_bob_client(MockIndexer::new()).await;
        let expected = "concurrent replay parity probe";
        let encrypted = alice
            .encrypt_psk(expected, &bob.encryption_public_key(), &TEST_PSK, 0)
            .unwrap();
        let mut duplicate_trials = 0;
        let mut both_rejected_trials = 0;
        let mut unexpected_plaintext_returns = 0;
        let mut successful_plaintext_returns = 0;

        for _ in 0..iterations {
            // Registering the contact resets its receive state for this trial.
            bob.add_psk_contact(ALICE_ADDR, &TEST_PSK, None)
                .await
                .unwrap();
            let barrier = std::sync::Barrier::new(2);
            let results = std::thread::scope(|scope| {
                let first = scope.spawn(|| {
                    let runtime = tokio::runtime::Builder::new_current_thread()
                        .build()
                        .unwrap();
                    barrier.wait();
                    runtime.block_on(bob.receive_psk(&encrypted, ALICE_ADDR))
                });
                let second = scope.spawn(|| {
                    let runtime = tokio::runtime::Builder::new_current_thread()
                        .build()
                        .unwrap();
                    barrier.wait();
                    runtime.block_on(bob.receive_psk(&encrypted, ALICE_ADDR))
                });
                (first.join().unwrap(), second.join().unwrap())
            });
            let mut accepted = 0;
            for result in [results.0, results.1] {
                if let Ok(plaintext) = result {
                    accepted += 1;
                    successful_plaintext_returns += 1;
                    if plaintext != expected {
                        unexpected_plaintext_returns += 1;
                    }
                }
            }
            if accepted > 1 {
                duplicate_trials += 1;
            }
            if accepted == 0 {
                both_rejected_trials += 1;
            }
        }

        println!(
            "ALGOCHAT_PARITY_REPLAY_RESULT={}",
            serde_json::json!({
                "iterations": iterations,
                "duplicate_trials": duplicate_trials,
                "both_rejected_trials": both_rejected_trials,
                "unexpected_plaintext_returns": unexpected_plaintext_returns,
                "successful_plaintext_returns": successful_plaintext_returns,
            })
        );
        assert_eq!(duplicate_trials, 0, "duplicate receives returned plaintext twice");
        assert_eq!(both_rejected_trials, 0, "a valid receive must succeed in every trial");
        assert_eq!(unexpected_plaintext_returns, 0, "received plaintext changed");
    }
