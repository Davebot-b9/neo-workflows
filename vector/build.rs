// Genera el código Rust de VectorService en cada `cargo build`, a partir de
// proto/neo/v1/vector.proto. protobuf-src compila su propio protoc, así que
// esto no depende de tener protoc instalado en la máquina.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    unsafe {
        std::env::set_var("PROTOC", protobuf_src::protoc());
    }

    tonic_prost_build::configure()
        .build_server(true)
        .build_client(false)
        .compile_protos(&["../proto/neo/v1/vector.proto"], &["../proto"])?;

    println!("cargo:rerun-if-changed=../proto/neo/v1/vector.proto");
    Ok(())
}
