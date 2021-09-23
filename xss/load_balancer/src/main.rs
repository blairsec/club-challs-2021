use std::collections::{hash_map, HashMap};
use std::error::Error;
use std::future::Future;
use std::mem::drop;
use std::net::Ipv4Addr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream, UnixStream};
use tokio::sync::Mutex;

fn block_on<F: Future>(fut: F) -> F::Output {
    tokio::task::block_in_place(move || {
        tokio::runtime::Handle::current().block_on(async move { fut.await })
    })
}

struct SockGuard {
    sockset: Arc<Mutex<HashMap<String, SockInfo>>>,
    sockname: String,
}

impl SockGuard {
    fn new(sockset: Arc<Mutex<HashMap<String, SockInfo>>>, sockname: String) -> Self {
        Self { sockset, sockname }
    }
}

impl Drop for SockGuard {
    fn drop(&mut self) {
        let mut lock = block_on(self.sockset.lock());
        if let Some(x) = lock.get_mut(&self.sockname) {
            x.conns -= 1;
        }
    }
}

struct SockInfo {
    pub conns: u32,
    pub healthcheck: Instant,
}

async fn process_socket(
    sock: TcpStream,
    sockset: Arc<Mutex<HashMap<String, SockInfo>>>,
) -> Result<(), Box<dyn Error>> {
    let mut sock = BufReader::new(sock);
    let indicator = sock.read_u8().await?;
    match indicator {
        b'r' => {
            let mut sockname = String::new();
            sock.read_line(&mut sockname).await?;
            sockname.pop(); // get rid of trailing newline
            println!("New socket registered: {:?}", sockname);
            match sockset.lock().await.entry(sockname) {
                hash_map::Entry::Occupied(_) => {
                    sock.write_all(b"e\n").await?;
                }
                hash_map::Entry::Vacant(e) => {
                    e.insert(SockInfo {
                        conns: 0,
                        healthcheck: Instant::now(),
                    });
                    sock.write_all(b"f\n").await?;
                }
            }
        }
        b'h' => {
            let mut sockname = String::new();
            sock.read_line(&mut sockname).await?;
            sockname.pop(); // get rid of trailing newline
            match sockset.lock().await.entry(sockname) {
                hash_map::Entry::Occupied(mut e) => {
                    e.get_mut().healthcheck = Instant::now();
                    sock.write_all(b"f\n").await?;
                }
                hash_map::Entry::Vacant(_) => {
                    sock.write_all(b"e\n").await?;
                }
            }
        }
        b'u' => {
            let mut sockname = String::new();
            sock.read_line(&mut sockname).await?;
            sockname.pop(); // get rid of trailing newline
            println!("Socket unregistering: {:?}", sockname);
            match sockset.lock().await.entry(sockname) {
                hash_map::Entry::Occupied(e) => {
                    e.remove();
                    sock.write_all(b"f\n").await?;
                }
                hash_map::Entry::Vacant(_) => {
                    sock.write_all(b"e\n").await?;
                }
            }
        }
        b'c' => {
            let mut lock = sockset.lock().await;
            if lock.is_empty() {
                drop(lock);
                sock.write_all(b"ERROR: No registered services in load balancer.\n")
                    .await?;
            } else {
                let (min_sock, min_val) = lock.iter_mut().min_by_key(|(_, b)| b.conns).unwrap();
                let min_sock = min_sock.clone();
                min_val.conns += 1;
                drop(lock);
                let _guard = SockGuard::new(Arc::clone(&sockset), min_sock.clone());
                let mut routed_sock = UnixStream::connect(min_sock).await?;
                let (mut routed_r, mut routed_w) = routed_sock.split();
                routed_w.write_all(sock.buffer()).await?;
                let mut sock = sock.into_inner();
                let (mut sock_r, mut sock_w) = sock.split();
                tokio::select!(
                    _ = tokio::io::copy(&mut sock_r, &mut routed_w) => {}
                    _ = tokio::io::copy(&mut routed_r, &mut sock_w) => {}
                );
            }
        }
        _ => {
            sock.write_all(b"ERROR: First byte must be a valid indicator.\n")
                .await?;
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|x| x.parse().ok())
        .ok_or("PORT env var must contain a valid port")?;
    let healthcheck_freq: u64 = std::env::var("HEALTHCHECK_FREQ")
        .ok()
        .and_then(|x| x.parse().ok())
        .unwrap_or(30000);
    let healthcheck_freq = Duration::from_millis(healthcheck_freq);
    let sockset: Arc<Mutex<HashMap<String, SockInfo>>> = Arc::new(Mutex::new(HashMap::new()));
    let listener = TcpListener::bind((Ipv4Addr::new(0, 0, 0, 0), port)).await?;
    println!("Load balancer listening on port {}.", port);
    let sockset_cloned = Arc::clone(&sockset);
    tokio::spawn(async move {
        loop {
            let mut to_remove: Vec<String> = Vec::new();
            let mut lock = sockset_cloned.lock().await;
            let now = Instant::now();
            for (a, b) in lock.iter() {
                if now - b.healthcheck > healthcheck_freq {
                    to_remove.push(a.clone());
                }
            }
            for k in to_remove {
                println!("Healthcheck failed for: {:?}", k);
                lock.remove(&k);
            }
            drop(lock);
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
    loop {
        let (sock, _) = listener.accept().await?;
        let sockset_cloned = Arc::clone(&sockset);
        tokio::spawn(async move {
            let _res = process_socket(sock, sockset_cloned).await;
        });
    }
}
