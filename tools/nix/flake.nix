{
  description = "OceanCare Compass Map Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          just
          nodejs_22
          python311
          # Linter and formatter for both Python projects. Pinned here rather
          # than resolved per project so `just lint` applies one version.
          ruff
          stdenv.cc.cc.lib
          uv
        ];
        shellHook = ''
          export LD_LIBRARY_PATH=${pkgs.stdenv.cc.cc.lib}/lib:$LD_LIBRARY_PATH
        '';
      };
    };
}
